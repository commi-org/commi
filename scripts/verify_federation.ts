
const BACKEND_URL = "http://localhost:8080";
const AGGREGATOR_URL = "http://localhost:8082";
const USERNAME = "demo_user";
const PASSWORD = "password123";
const TARGET_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"; // Rick Roll

async function main() {
  // 1. Login to get token
  console.log("1. Logging in to Backend...");
  const loginRes = await fetch(`${BACKEND_URL}/oauth/token`, {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "password",
      username: USERNAME,
      password: PASSWORD
    })
  });
  
  if (!loginRes.ok) {
    console.error("Login failed");
    Deno.exit(1);
  }
  
  const { access_token } = await loginRes.json();
  console.log("   Got access token.");

  // 2. Post Annotation
  console.log("2. Posting Annotation to Backend...");
  const content = "This is a test annotation " + Date.now();
  const postRes = await fetch(`${BACKEND_URL}/api/annotations`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${access_token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      content,
      target: {
        href: TARGET_URL,
        selector: { type: "TextQuoteSelector", exact: "Never gonna give you up" }
      }
    })
  });

  if (!postRes.ok) {
    console.error("Post failed:", await postRes.text());
    Deno.exit(1);
  }
  
  const annotation = await postRes.json();
  console.log(`   Posted annotation: ${annotation.id}`);

  // 3. Wait for Federation
  console.log("3. Waiting for federation (5s)...");
  await new Promise(r => setTimeout(r, 5000));

  // 4. Check Aggregator
  console.log("4. Checking Aggregator...");
  const searchRes = await fetch(`${AGGREGATOR_URL}/api/search?url=${encodeURIComponent(TARGET_URL)}`);
  const notes = await searchRes.json();
  
  const found = notes.find((n: any) => n.content === content);
  
  if (found) {
    console.log("SUCCESS! Annotation found in Aggregator.");
    console.log("   ID:", found.id);
    console.log("   Content:", found.content);
  } else {
    console.error("FAILURE: Annotation not found in Aggregator.");
    console.log("   Notes found:", notes);
  }
}

main();
