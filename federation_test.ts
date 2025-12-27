function assertEquals(actual: any, expected: any, msg?: string) {
  if (actual !== expected) {
    throw new Error(msg || `Expected ${expected} but got ${actual}`);
  }
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const BACKEND_DIR = "./apps/backend";
const AGGREGATOR_DIR = "./apps/aggregator";
const BACKEND_URL = "http://localhost:8080";
const AGGREGATOR_URL = "http://localhost:8082";

async function resetData() {
  // Ensure files exist or create them with empty array
  await Deno.writeTextFile(`${BACKEND_DIR}/annotations.json`, "[]");
  await Deno.writeTextFile(`${BACKEND_DIR}/followers.json`, "[]");
  await Deno.writeTextFile(`${AGGREGATOR_DIR}/aggregated.json`, "[]");
}

async function startService(dir: string, port: number) {
  const cmd = new Deno.Command("deno", {
    args: ["task", "start"],
    cwd: dir,
    stdout: "piped",
    stderr: "piped",
  });
  const process = cmd.spawn();
  
  // Wait for health check
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
  name: "Federation E2E Test: Aggregator Subscription & Ingestion",
  async fn() {
    console.log("Resetting data...");
    await resetData();

    console.log("Starting services...");
    let backend: Deno.ChildProcess | null = null;
    let aggregator: Deno.ChildProcess | null = null;

    try {
      backend = await startService(BACKEND_DIR, 8080);
      console.log("Backend started.");
      
      aggregator = await startService(AGGREGATOR_DIR, 8082);
      console.log("Aggregator started.");

      console.log("Triggering subscription...");
      
      // 1. Subscribe Aggregator to Backend
      const subRes = await fetch(`${AGGREGATOR_URL}/api/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetActor: `${BACKEND_URL}/users/commi`
        })
      });
      
      if (!subRes.ok) {
        const text = await subRes.text();
        throw new Error(`Subscription failed: ${subRes.status} ${text}`);
      }
      assertEquals(subRes.status, 200);
      
      // Wait for subscription to process (Follow -> Accept)
      console.log("Waiting for subscription handshake...");
      await delay(2000);

      // Verify Backend has follower
      const followers = JSON.parse(await Deno.readTextFile(`${BACKEND_DIR}/followers.json`));
      assertEquals(followers.length, 1, "Backend should have 1 follower");
      assertEquals(followers[0].id, `${AGGREGATOR_URL}/users/index`);

      console.log("Subscription successful. Creating annotation...");

      // 2. Create Annotation on Backend
      const noteContent = `Federation Test ${Date.now()}`;
      const createRes = await fetch(`${BACKEND_URL}/api/annotations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: noteContent,
          target: {
            href: "https://test.com",
            selector: { type: "TextQuoteSelector", exact: "test" }
          }
        })
      });
      assertEquals(createRes.status, 201);

      // Wait for federation
      console.log("Waiting for federation...");
      await delay(3000);

      // 3. Verify Aggregator received it
      const aggregated = JSON.parse(await Deno.readTextFile(`${AGGREGATOR_DIR}/aggregated.json`));
      const found = aggregated.find((n: any) => n.content === noteContent);
      
      if (!found) {
        console.log("Aggregated data:", aggregated);
        throw new Error("Annotation not found in aggregator");
      }
      assertEquals(found.content, noteContent);
      console.log("Federation successful!");

    } catch (err) {
      console.error("Test failed:", err);
      throw err;
    } finally {
      console.log("Stopping services...");
      if (backend) backend.kill();
      if (aggregator) aggregator.kill();
      
      // Ensure ports are freed
      await delay(1000);
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
});
