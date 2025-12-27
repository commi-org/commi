function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function assertEquals(actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}\n  Expected: ${expected}\n  Actual: ${actual}`);
  }
}

async function ensureAdminUser(dbPath: string): Promise<string> {
  const checkCmd = new Deno.Command("sqlite3", {
    args: [dbPath, "SELECT id FROM users WHERE email='admin@example.com';"]
  });
  let adminUserId = new TextDecoder().decode((await checkCmd.output()).stdout).trim();
  
  if (!adminUserId) {
    const createCmd = new Deno.Command("docker", {
      args: ["compose", "exec", "-T", "gotosocial", "/gotosocial/gotosocial", 
             "admin", "account", "create", "--username", "admin", 
             "--email", "admin@example.com", "--password", "StrongPassword123!"]
    });
    await createCmd.output();
    await delay(2000);
    
    adminUserId = new TextDecoder().decode((await checkCmd.output()).stdout).trim();
    if (!adminUserId) throw new Error("Failed to create admin user");
  }
  
  return adminUserId;
}

async function waitForGTS() {
  console.log("Waiting for GoToSocial to be ready...");
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch("http://localhost:8081/api/v1/instance");
      if (res.ok) {
        console.log("GoToSocial is ready.");
        return;
      }
    } catch (_) { /* ignore */ }
    await delay(1000);
  }
  throw new Error("GoToSocial failed to start");
}

async function injectGTSToken(dbPath: string, adminUserId: string): Promise<string> {
  // Register app
  const appRes = await fetch("http://localhost:8081/api/v1/apps", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "Commi E2E Test",
      redirect_uris: "urn:ietf:wg:oauth:2.0:oob",
      scopes: "read write follow"
    })
  });
  const { client_id } = await appRes.json();
  
  // Inject token into DB
  const accessToken = "TEST_TOKEN_" + Date.now();
  const tokenId = "01" + Array(24).fill(0).map(() => Math.floor(Math.random()*36).toString(36).toUpperCase()).join("");
  
  const insertCmd = new Deno.Command("sqlite3", {
    args: [dbPath, `INSERT INTO tokens (id, client_id, user_id, redirect_uri, scope, access, access_create_at, access_expires_at) VALUES ('${tokenId}', '${client_id}', '${adminUserId}', 'urn:ietf:wg:oauth:2.0:oob', 'read write follow', '${accessToken}', datetime('now'), datetime('now', '+1 year'));`]
  });
  
  const insertOutput = await insertCmd.output();
  if (!insertOutput.success) {
    const stderr = new TextDecoder().decode(insertOutput.stderr);
    console.error("SQLite insert failed:", stderr);
    console.error("DB path:", dbPath);
    console.error("Admin user ID:", adminUserId);
    console.error("Client ID:", client_id);
    throw new Error(`Failed to inject token: ${stderr}`);
  }
  
  // Restart GTS to pick up new token
  await new Deno.Command("docker", { args: ["compose", "restart", "gotosocial"] }).output();
  
  // Wait for GTS to be ready
  await waitForGTS();
  
  return accessToken;
}

const COMMI_API = "http://localhost:8080";
const GTS_API = "http://localhost:8081";

Deno.test({
  name: "E2E: Full Federation Flow (Outbound + Inbound)",
  fn: async () => {
    const dbPath = Deno.cwd().endsWith("backend") 
      ? "../../gotosocial_data/sqlite.db"
      : "./gotosocial_data/sqlite.db";

    await waitForGTS();

    // 1. Create annotation on Commi
    const targetUrl = "https://example.com/federation-test-" + Date.now();
    const annotationRes = await fetch(`${COMMI_API}/api/annotations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: "Hello from Commi! Please reply to me.",
        target: { href: targetUrl, selector: { type: "TextQuoteSelector", exact: "Test Context" } },
        author: "me"
      })
    });
    
    if (!annotationRes.ok) throw new Error("Failed to create annotation");
    const annotation = await annotationRes.json();

    // 2. Setup GTS authentication
    const adminUserId = await ensureAdminUser(dbPath);
    const accessToken = await injectGTSToken(dbPath, adminUserId);

    // 3. Wait for annotation to federate to GTS
    let gtsStatusId = null;
    for (let i = 0; i < 10; i++) {
      await delay(1000);
      const cmd = new Deno.Command("sqlite3", {
        args: [dbPath, `SELECT id FROM statuses WHERE uri = '${annotation.id}';`]
      });
      const id = new TextDecoder().decode((await cmd.output()).stdout).trim();
      if (id) {
        gtsStatusId = id;
        break;
      }
    }
    
    if (!gtsStatusId) throw new Error("Annotation did not federate to GoToSocial");

    // 4. Post reply from GTS
    const timestamp = Date.now();
    const replyRes = await fetch(`${GTS_API}/api/v1/statuses`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        status: `@commi@localhost:8080 Test Reply ${timestamp}`,
        in_reply_to_id: gtsStatusId,
        visibility: "public"
      })
    });
    
    if (!replyRes.ok) throw new Error("Failed to post reply");

    // 5. Verify reply appears in Commi
    for (let i = 0; i < 60; i++) {
      await delay(1000);
      const listRes = await fetch(`${COMMI_API}/api/annotations?url=${encodeURIComponent(targetUrl)}`);
      const annotations = await listRes.json();
      
      const foundReply = annotations.find((a: any) => 
        a.content.includes(timestamp.toString()) && a.inReplyTo === annotation.id
      );
      
      if (foundReply) {
        // Assertions
        assert(foundReply.content.includes(timestamp.toString()), "Reply content should include timestamp");
        assertEquals(foundReply.inReplyTo, annotation.id, "Reply should reference original annotation");
        assertEquals(foundReply.target.href, targetUrl, "Reply should have same target URL");
        return;
      }
    }

    throw new Error("Reply did not appear in Commi after 60 seconds");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});
