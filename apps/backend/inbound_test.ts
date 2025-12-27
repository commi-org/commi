
import { Note } from "@fedify/fedify";
import { processIncomingNote } from "./fedify.ts";
import { loadAnnotations, saveAnnotations, type Annotation } from "./db.ts";

function assertEquals(actual: any, expected: any, msg?: string) {
  if (actual !== expected) {
    throw new Error(msg || `Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
  }
}

Deno.test("Logic: Reply inherits target", async () => {
  // 1. Setup: Create a parent annotation in the DB
  const parentId = `http://localhost:8080/annotations/parent-${Date.now()}`;
  const targetUrl = "https://example.com/logic-test";
  
  const parent: Annotation = {
    id: parentId,
    type: 'Note',
    attributedTo: 'local_user',
    content: 'Parent',
    target: { href: targetUrl },
    published: new Date().toISOString()
  };
  
  const all = loadAnnotations();
  all.push(parent);
  saveAnnotations(all);

  // 2. Create a mock incoming Note
  // We can construct a Note from JSON-LD to ensure it has the right structure
  const replyId = `https://remote.instance/notes/${Date.now()}`;
  const note = await Note.fromJsonLd({
    "@context": "https://www.w3.org/ns/activitystreams",
    id: replyId,
    type: "Note",
    content: "Reply Content",
    attributedTo: "https://remote.instance/users/bob",
    inReplyTo: parentId,
    published: new Date().toISOString()
  });

  // 3. Process it
  await processIncomingNote(note);

  // 4. Verify
  const updated = loadAnnotations();
  const reply = updated.find(a => a.id === replyId);
  
  if (!reply) throw new Error("Reply not saved to DB");
  
  assertEquals(reply.target.href, targetUrl);
  assertEquals(reply.inReplyTo, parentId);
  console.log("Test Passed: Reply inherited target URL");
});
