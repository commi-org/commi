// Simple assertion helper to avoid external dependencies in restricted envs
function assertEquals(actual: any, expected: any, msg?: string) {
  if (actual !== expected) {
    throw new Error(msg || `Expected ${expected} but got ${actual}`);
  }
}

const API_URL = "http://localhost:8080";
// Path to GoToSocial DB relative to where we run the test (apps/backend)
const currentDir = new URL(".", import.meta.url).pathname;
const GTS_DB_PATH = `${currentDir}../../gotosocial_data/sqlite.db`; 

Deno.test({
  name: "E2E: Create Annotation and Verify Federation",
  fn: async () => {
    // 1. Create Annotation
    const uniqueContent = `Automated Federation Test ${Date.now()}`;
    console.log(`Sending annotation: "${uniqueContent}"`);

    // Simulate the extension payload (including the problematic author: 'me' to ensure fix works)
    const res = await fetch(`${API_URL}/api/annotations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: uniqueContent,
        target: {
          href: "https://example.com",
          selector: { type: "TextQuoteSelector", exact: "Test" }
        },
        author: "me" // This previously caused the 500 error
      })
    });
    
    assertEquals(res.status, 201);
    const annotation = await res.json();
    console.log(`Created annotation ID: ${annotation.id}`);
    
    // Verify the backend sanitized the author
    assertEquals(annotation.attributedTo.includes("http"), true, "attributedTo should be a valid URL");
    assertEquals(annotation.attributedTo.endsWith("/users/guest"), true, "Should default to guest user");

    // 3. Wait for Federation (async in backend)
    console.log("Waiting for federation to complete...");
    
    const maxRetries = 60; // 30 seconds total (increased from 10s)
    let found = false;
    let stdout = "";

    for (let i = 0; i < maxRetries; i++) {
      // 4. Check GoToSocial Database via sqlite3
      const command = new Deno.Command("sqlite3", {
        args: [
          GTS_DB_PATH,
          `SELECT id, content FROM statuses WHERE content LIKE '%${uniqueContent}%';`
        ]
      });
      
      const output = await command.output();
      stdout = new TextDecoder().decode(output.stdout).trim();
      
      if (output.code !== 0) {
        const stderr = new TextDecoder().decode(output.stderr);
        console.error(`sqlite3 error: ${stderr}`);
        throw new Error("Failed to query GoToSocial database. Ensure sqlite3 is installed.");
      }

      if (stdout.includes(uniqueContent)) {
        found = true;
        break;
      }

      await new Promise(r => setTimeout(r, 500));
    }

    console.log(`GoToSocial Query Result: "${stdout}"`);

    if (!found) {
      console.log("Federation failed. Dumping GoToSocial logs:");
      try {
        const logsCmd = new Deno.Command("docker", { args: ["logs", "--tail", "100", "gotosocial"] });
        const logsOutput = await logsCmd.output();
        console.log("--- GoToSocial Stderr ---");
        console.log(new TextDecoder().decode(logsOutput.stderr));
        console.log("--- GoToSocial Stdout ---");
        console.log(new TextDecoder().decode(logsOutput.stdout));
      } catch (e) {
        console.error("Failed to dump logs:", e);
      }
    }

    assertEquals(found, true, "Federated status not found in GoToSocial database after 10s");
  }
});
