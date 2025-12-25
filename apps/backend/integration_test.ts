const API_URL = "http://localhost:8080";

function assertEquals(actual: any, expected: any, msg?: string) {
  if (actual !== expected) {
    throw new Error(msg || `Expected ${expected} but got ${actual}`);
  }
}

Deno.test("ActivityPub Actor Profile", async () => {
  const res = await fetch(`${API_URL}/users/alice`);
  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.type, "Person");
  assertEquals(data.preferredUsername, "alice");
});

Deno.test("Create and Fetch Annotation", async () => {
  const targetUrl = "https://example.com/test-page";

  // 1. Create
  const createRes = await fetch(`${API_URL}/api/annotations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: "Test annotation",
      target: {
        href: targetUrl,
        selector: {
          type: "TextQuoteSelector",
          exact: "Test"
        }
      },
      author: "alice"
    })
  });
  assertEquals(createRes.status, 201);
  const created = await createRes.json();
  assertEquals(created.content, "Test annotation");

  // 2. Fetch
  const getRes = await fetch(`${API_URL}/api/annotations?url=${encodeURIComponent(targetUrl)}`);
  assertEquals(getRes.status, 200);
  const list = await getRes.json();

  // Check if our created annotation is in the list
  const found = list.find((a: any) => a.id === created.id);
  assertEquals(!!found, true);
  assertEquals(found.target.selector.exact, "Test");
});
