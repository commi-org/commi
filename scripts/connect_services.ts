
const BACKEND_URL = "http://localhost:8080";
const AGGREGATOR_URL = "http://localhost:8082";
const USERNAME = "demo_user";
const PASSWORD = "password123";

async function main() {
  console.log("1. Registering user on Backend...");
  try {
    const regRes = await fetch(`${BACKEND_URL}/api/v1/accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        username: USERNAME, 
        email: `${USERNAME}@example.com`, 
        password: PASSWORD 
      }),
    });

    if (regRes.ok) {
      console.log("   User registered successfully.");
    } else {
      const err = await regRes.json();
      if (err.error === "Username or email already exists") {
        console.log("   User already exists.");
      } else {
        console.error("   Registration failed:", err);
        Deno.exit(1);
      }
    }
  } catch (e) {
    console.error("   Failed to connect to Backend. Is it running?", e.message);
    Deno.exit(1);
  }

  console.log("2. Subscribing Aggregator to Instance Actor (Wildcard)...");
  const targetActor = `${BACKEND_URL}/users/commi-instance`;
  
  try {
    const subRes = await fetch(`${AGGREGATOR_URL}/api/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetActor }),
    });

    if (subRes.ok) {
      console.log("   Subscription request sent successfully.");
    } else {
      console.error("   Subscription failed:", await subRes.text());
      Deno.exit(1);
    }
  } catch (e) {
    console.error("   Failed to connect to Aggregator. Is it running?", e.message);
    Deno.exit(1);
  }

  console.log("Done! The Aggregator is now following the Backend user.");
}

main();
