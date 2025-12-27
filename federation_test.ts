

function assertEquals(actual: any, expected: any) {
  if (actual !== expected) {
     if (typeof actual === 'object' && actual !== null && typeof expected === 'object' && expected !== null) {
         if (JSON.stringify(actual) !== JSON.stringify(expected)) {
             throw new Error(`Expected ${JSON.stringify(expected)}, but got ${JSON.stringify(actual)}`);
         }
     } else {
        throw new Error(`Expected ${expected}, but got ${actual}`);
     }
  }
}


function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const BACKEND_DIR = "./apps/backend";
const AGGREGATOR_DIR = "./apps/aggregator";
const BACKEND_URL = "http://localhost:8080";
const AGGREGATOR_URL = "http://localhost:8082";

const TEST_KV_PATH = "./test_backend.kv";

async function resetData() {
  // Reset Backend (Deno KV)
  try {
    await Deno.remove(`${BACKEND_DIR}/${TEST_KV_PATH}`);
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) console.error("Error removing KV:", e);
  }

  // Reset Aggregator (JSON)
  try { await Deno.writeTextFile(`${AGGREGATOR_DIR}/aggregated.json`, "[]"); } catch {}
}

async function startService(dir: string, port: number, env: Record<string, string> = {}) {
  const cmd = new Deno.Command("deno", {
    args: ["task", "start"],
    cwd: dir,
    env: { ...Deno.env.toObject(), ...env },
    stdout: "inherit",
    stderr: "inherit",
  });
  const process = cmd.spawn();
  
  const start = Date.now();
  while (Date.now() - start < 15000) {
    try {
      await fetch(`http://localhost:${port}`);
      return process;
    } catch {
      await delay(500);
    }
  }
  process.kill();
  throw new Error(`Failed to start service in ${dir} on port ${port}`);
}

Deno.test({
  name: "Federation E2E Test: Full Chain (Backend <-> Aggregator)",
  async fn() {
    console.log("Resetting data...");
    await resetData();

    console.log("Starting services...");
    let backend: Deno.ChildProcess | null = null;
    let aggregator: Deno.ChildProcess | null = null;

    try {
      backend = await startService(BACKEND_DIR, 8080, { "KV_PATH": TEST_KV_PATH });
      console.log("Backend started.");
      
      aggregator = await startService(AGGREGATOR_DIR, 8082);
      console.log("Aggregator started.");

      console.log("Setting up Instance Actor...");
      const setupCmd = new Deno.Command("deno", {
        args: ["run", "--allow-read", "--allow-write", "--allow-env", "--unstable-kv", "setup_instance_actor.ts"],
        cwd: BACKEND_DIR,
        env: { "KV_PATH": TEST_KV_PATH }
      });
      await setupCmd.output();

      console.log("Triggering subscription...");
      const subRes = await fetch(`${AGGREGATOR_URL}/api/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetActor: `${BACKEND_URL}/users/commi-instance`
        })
      });
      
      if (!subRes.ok) {
        const text = await subRes.text();
        throw new Error(`Subscription failed: ${subRes.status} ${text}`);
      }
      assertEquals(subRes.status, 200);
      
      console.log("Waiting for subscription handshake...");
      await delay(2000);

      console.log("Subscription successful. Registering user...");
      const username = "test_user_" + Date.now();
      const password = "password";
      
      const regRes = await fetch(`${BACKEND_URL}/api/v1/accounts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email: `${username}@example.com`, password })
      });
      
      let token = "";
      if (regRes.ok) {
        const data = await regRes.json();
        token = data.access_token;
      } else {
        const loginRes = await fetch(`${BACKEND_URL}/oauth/token`, {
            method: "POST",
            body: new URLSearchParams({ grant_type: "password", username, password })
        });
        if (!loginRes.ok) throw new Error("Failed to register/login");
        const data = await loginRes.json();
        token = data.access_token;
      }

      console.log("Creating annotation...");
      const noteContent = `Federation Test ${Date.now()}`;
      const createRes = await fetch(`${BACKEND_URL}/api/annotations`, {
        method: "POST",
        headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          content: noteContent,
          target: {
            href: "https://test.com",
            selector: { type: "TextQuoteSelector", exact: "test" }
          }
        })
      });
      
      if (!createRes.ok) {
          throw new Error(`Failed to create annotation: ${await createRes.text()}`);
      }
      const createdNote = await createRes.json();
      assertEquals(createRes.status, 201);

      console.log("Waiting for federation (10s)...");
      await delay(10000);

      const searchRes = await fetch(`${AGGREGATOR_URL}/api/search`);
      const notes = await searchRes.json();
      const found = notes.find((n: any) => n.content === noteContent);
      
      if (!found) {
        console.log("Aggregated notes:", JSON.stringify(notes, null, 2));
        throw new Error("Annotation not found in aggregator");
      }
      assertEquals(found.content, noteContent);
      // Check target URL match (allowing for trailing slash difference)
      const expectedTarget = "https://test.com";
      if (found.targetUrl !== expectedTarget && found.targetUrl !== expectedTarget + "/") {
          throw new Error(`Target URL mismatch: expected ${expectedTarget}, got ${found.targetUrl}`);
      }
      console.log("Outbound Federation successful!");

      console.log("Testing Inbound Reply...");
      const replyContent = `Reply from Aggregator ${Date.now()}`;
      
      const replyRes = await fetch(`${AGGREGATOR_URL}/api/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: replyContent,
          inReplyTo: createdNote.id,
          targetActor: `${BACKEND_URL}/users/${username}`
        })
      });
      
      if (!replyRes.ok) {
        const text = await replyRes.text();
        throw new Error(`Reply failed: ${replyRes.status} ${text}`);
      }
      assertEquals(replyRes.status, 200);

      console.log("Reply sent. Waiting for ingestion...");
      await delay(3000);

      const listRes = await fetch(`${BACKEND_URL}/api/annotations?url=https%3A%2F%2Ftest.com`);
      const backendAnnotations = await listRes.json();
      const replyAnnotation = backendAnnotations.find((a: any) => a.content === replyContent);
      
      if (!replyAnnotation) {
        console.log("Backend Annotations:", backendAnnotations);
        throw new Error("Reply not found in backend");
      }
      
      assertEquals(replyAnnotation.target.href, "https://test.com");
      console.log("Inbound Reply Loop successful!");

    } catch (err) {
      console.error("Test failed:", err);
      throw err;
    } finally {
      console.log("Stopping services...");
      if (backend) backend.kill();
      if (aggregator) aggregator.kill();
      await delay(1000);
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});
