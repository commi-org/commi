
import { createUser, getUser } from "./db.ts";

const HOST = "http://localhost:8080";
const INSTANCE_ACTOR = "commi-instance";

async function main() {
  const existing = await getUser(INSTANCE_ACTOR);
  if (existing) {
    console.log("Instance actor already exists.");
    return;
  }

  console.log("Creating instance actor...");
  // Create a user with a random password (nobody logs in as this user)
  await createUser(INSTANCE_ACTOR, "admin@commi.local", "random-hash", HOST);
  console.log("Instance actor created: " + INSTANCE_ACTOR);
}

main();
