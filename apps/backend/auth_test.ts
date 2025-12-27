const API_URL = "http://localhost:8080";

function assertEquals(actual: any, expected: any, msg?: string) {
  if (actual !== expected) {
    throw new Error(msg || `Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
  }
}

Deno.test("Authentication Flow", async (t) => {
  const username = `testuser_${Date.now()}`;
  const email = `${username}@example.com`;
  const password = "password123";
  let accessToken = "";

  await t.step("Register User", async () => {
    const res = await fetch(`${API_URL}/api/v1/accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password }),
    });
    
    if (res.status !== 200) {
        const text = await res.text();
        throw new Error(`Register failed: ${res.status} ${text}`);
    }
    
    const data = await res.json();
    assertEquals(data.username, username);
    if (!data.access_token) throw new Error("No access token returned on register");
    accessToken = data.access_token;
  });

  await t.step("Login User", async () => {
    const params = new URLSearchParams();
    params.append("grant_type", "password");
    params.append("username", username);
    params.append("password", password);

    const res = await fetch(`${API_URL}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    });

    if (res.status !== 200) {
        const text = await res.text();
        throw new Error(`Login failed: ${res.status} ${text}`);
    }

    const data = await res.json();
    if (!data.access_token) throw new Error("No access token returned on login");
    // Update token to ensure we use the fresh one (though register gave one too)
    accessToken = data.access_token;
  });

  await t.step("Verify Credentials", async () => {
    const res = await fetch(`${API_URL}/api/v1/accounts/verify_credentials`, {
      headers: { "Authorization": `Bearer ${accessToken}` },
    });
    
    if (res.status !== 200) {
        const text = await res.text();
        throw new Error(`Verify failed: ${res.status} ${text}`);
    }

    const data = await res.json();
    assertEquals(data.username, username);
  });

  await t.step("Create Annotation (Protected)", async () => {
    const annotation = {
      content: "Test Annotation",
      target: {
        href: "https://www.youtube.com/watch?v=test",
        selector: { type: "TextQuoteSelector", exact: "test" }
      }
    };

    const res = await fetch(`${API_URL}/api/annotations`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`
      },
      body: JSON.stringify(annotation),
    });

    if (res.status !== 201) {
        const text = await res.text();
        throw new Error(`Create Annotation failed: ${res.status} ${text}`);
    }

    const data = await res.json();
    assertEquals(data.content, annotation.content);
    assertEquals(data.attributedTo.includes(username), true);
  });

  await t.step("Create Annotation (Unauthorized)", async () => {
    const annotation = {
      content: "Should Fail",
      target: { href: "https://example.com" }
    };

    const res = await fetch(`${API_URL}/api/annotations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(annotation),
    });

    await res.text(); // Consume body
    assertEquals(res.status, 401);
  });
});
