
import { Follow, Undo, Context } from "@fedify/fedify";
import { loadFollowers, saveFollowers } from "./db.ts";
import { processFollow, processUndo } from "./fedify.ts";

const API_URL = "http://localhost:8080";

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

// Mock Context
const mockCtx = {
  getActorUri: (handle: string) => new URL(`http://localhost:8080/users/${handle}`),
  lookupObject: async (url: URL) => null, // Simulate failure to lookup
  sendActivity: async (sender: any, recipients: any, activity: any) => {
    console.log("Mock sendActivity called");
  }
} as unknown as Context<void>;

Deno.test("Follower Management", async (t) => {
  // Reset followers
  saveFollowers([]);

  const followerId = "https://remote.instance/users/fan";
  const followerInbox = "https://remote.instance/users/fan/inbox";

  await t.step("Receive Follow Activity", async () => {
    const follow = new Follow({
      id: new URL("https://remote.instance/activities/follow-1"),
      actor: new URL(followerId),
      object: new URL("http://localhost:8080/users/commi"),
    });

    await processFollow(mockCtx, follow);

    // Verify follower is saved
    const followers = loadFollowers();
    const found = followers.find(f => f.id === followerId);
    assert(!!found, "Follower should be saved");
    // The fallback logic appends /inbox
    assertEquals(found?.inbox, followerInbox);
  });

  await t.step("Check Followers Collection", async () => {
    const res = await fetch(`${API_URL}/users/commi/followers`, {
      headers: { "Accept": "application/activity+json" }
    });
    assertEquals(res.status, 200);
    const collection = await res.json();
    
    // Should contain the follower ID
    const items = collection.items || collection.orderedItems || [];
    const found = items.find((item: any) => (typeof item === 'string' ? item : item.id) === followerId);
    assert(!!found, "Follower should be in collection");
  });

  await t.step("Receive Undo Follow Activity", async () => {
    const follow = new Follow({
      id: new URL("https://remote.instance/activities/follow-1"),
      actor: new URL(followerId),
      object: new URL("http://localhost:8080/users/commi"),
    });

    const undo = new Undo({
      id: new URL("https://remote.instance/activities/undo-1"),
      actor: new URL(followerId),
      object: follow
    });

    await processUndo(mockCtx, undo);

    const followers = loadFollowers();
    const found = followers.find(f => f.id === followerId);
    assert(!found, "Follower should be removed");
  });
});
