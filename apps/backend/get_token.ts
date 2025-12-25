
const GTS_URL = "http://localhost:8081";
const REDIRECT_URI = "urn:ietf:wg:oauth:2.0:oob";

async function main() {
  console.log("1. Registering Application...");
  const appRes = await fetch(`${GTS_URL}/api/v1/apps`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "Commi Test Script",
      redirect_uris: REDIRECT_URI,
      scopes: "read write follow",
      website: "http://localhost:8080"
    })
  });

  if (!appRes.ok) {
    console.error("Failed to register app:", await appRes.text());
    Deno.exit(1);
  }

  const appData = await appRes.json();
  const clientId = appData.client_id;
  const clientSecret = appData.client_secret;

  console.log("\n2. Authorize Application");
  const authUrl = `${GTS_URL}/oauth/authorize?client_id=${clientId}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=read+write+follow`;
  console.log(`\nPlease visit this URL in your browser:\n\n${authUrl}\n`);
  console.log("Log in as 'admin', click 'Allow', and copy the authorization code.");

  const code = prompt("\nEnter the authorization code here:");
  if (!code) {
    console.error("No code provided.");
    Deno.exit(1);
  }

  console.log("\n3. Exchanging code for access token...");
  const tokenRes = await fetch(`${GTS_URL}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
      code: code
    })
  });

  if (!tokenRes.ok) {
    console.error("Failed to get token:", await tokenRes.text());
    Deno.exit(1);
  }

  const tokenData = await tokenRes.json();
  console.log("\nSUCCESS! Here is your access token:\n");
  console.log(tokenData.access_token);
  console.log("\nUse it in your curl commands:");
  console.log(`curl -H "Authorization: Bearer ${tokenData.access_token}" "${GTS_URL}/api/v2/search?q=..."`);
}

if (import.meta.main) {
  main();
}
