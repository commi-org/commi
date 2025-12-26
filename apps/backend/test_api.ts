const API_URL = "http://localhost:8080";

// --- Helpers ---

function assertEquals(actual: any, expected: any, msg?: string) {
  if (actual !== expected) {
    throw new Error(msg || `Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
  }
}

function assert(condition: boolean, msg?: string) {
  if (!condition) {
    throw new Error(msg || "Assertion failed");
  }
}

// --- Tests ---

Deno.test("GET /users/:name - Actor Profile", async () => {
  const res = await fetch(`${API_URL}/users/commi`);
  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.type, "Person");
  assertEquals(data.preferredUsername, "commi");
  assert(data.inbox.endsWith("/users/commi/inbox"), "Inbox URL incorrect");
});

Deno.test("POST /api/annotations - Validation Errors", async () => {
  // Missing content
  const res1 = await fetch(`${API_URL}/api/annotations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      target: { href: "https://example.com" }
    })
  });
  await res1.body?.cancel(); // Consume body
  assertEquals(res1.status, 400);

  // Missing target
  const res2 = await fetch(`${API_URL}/api/annotations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: "Hello"
    })
  });
  await res2.body?.cancel(); // Consume body
  assertEquals(res2.status, 400);
});

Deno.test("POST /api/annotations - Create & Fetch (TextQuote)", async () => {
  const targetUrl = "https://example.com/article";
  const content = "This is a test annotation " + Date.now();
  
  // 1. Create
  const createRes = await fetch(`${API_URL}/api/annotations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content,
      target: {
        href: targetUrl,
        selector: {
          type: "TextQuoteSelector",
          exact: "Important text"
        }
      },
      author: "bob"
    })
  });
  assertEquals(createRes.status, 201);
  const created = await createRes.json();
  assertEquals(created.content, content);
  assertEquals(created.target.selector.type, "TextQuoteSelector");

  // 2. Fetch
  const getRes = await fetch(`${API_URL}/api/annotations?url=${encodeURIComponent(targetUrl)}`);
  assertEquals(getRes.status, 200);
  const list = await getRes.json();
  
  const found = list.find((a: any) => a.id === created.id);
  assert(!!found, "Created annotation not found in list");
  assertEquals(found.content, content);
});

Deno.test("POST /api/annotations - Create & Fetch (Timestamp)", async () => {
  const targetUrl = "https://youtube.com/watch?v=12345";
  
  const createRes = await fetch(`${API_URL}/api/annotations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: "Jump scare here",
      target: {
        href: targetUrl,
        selector: {
          type: "TimestampSelector",
          start: "PT1M30S"
        }
      },
      author: "charlie"
    })
  });
  assertEquals(createRes.status, 201);
  const created = await createRes.json();
  assertEquals(created.target.selector.type, "TimestampSelector");
  assertEquals(created.target.selector.start, "PT1M30S");
});

Deno.test("GET /users/:name/outbox - Check Outbox", async () => {
  // Create one as guest
  const createRes = await fetch(`${API_URL}/api/annotations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: "Guest comment",
      target: { href: "https://example.com" }
    })
  });
  await createRes.body?.cancel();

  const res = await fetch(`${API_URL}/users/guest/outbox`);
  assertEquals(res.status, 200);
  const collection = await res.json();
  assertEquals(collection.type, "OrderedCollection");
  assert(collection.totalItems > 0, "Outbox should not be empty");
  assert(collection.orderedItems[0].type, "Create");
});

Deno.test("POST /users/:name/inbox - Receive Federation", async () => {
  const activity = {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: "https://remote.server/activities/1",
    type: "Create",
    actor: "https://remote.server/users/dave",
    object: {
      id: "https://remote.server/notes/1",
      type: "Note",
      content: "Federated hello!",
      attributedTo: "https://remote.server/users/dave",
      target: {
        href: "https://example.com/federated"
      }
    }
  };

  const res = await fetch(`${API_URL}/users/alice/inbox`, {
    method: "POST",
    headers: { "Content-Type": "application/activity+json" },
    body: JSON.stringify(activity)
  });
  
  assertEquals(res.status, 202);
  await res.body?.cancel();

  // Verify it was saved
  const getRes = await fetch(`${API_URL}/api/annotations?url=${encodeURIComponent("https://example.com/federated")}`);
  const list = await getRes.json();
  const found = list.find((a: any) => a.content === "Federated hello!");
  assert(!!found, "Federated activity not persisted");
});

