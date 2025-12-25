import { generateKeyPairSync } from "node:crypto";

export interface KeyPair {
  publicKey: string;
  privateKey: string;
}

const KEY_FILE = "./keys.json";

export function getOrCreateKeyPair(): KeyPair {
  try {
    const data = Deno.readTextFileSync(KEY_FILE);
    return JSON.parse(data);
  } catch {
    console.log("Generating new RSA key pair...");
    const { publicKey, privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: "spki",
        format: "pem",
      },
      privateKeyEncoding: {
        type: "pkcs8",
        format: "pem",
      },
    });

    const keys = { publicKey, privateKey };
    Deno.writeTextFileSync(KEY_FILE, JSON.stringify(keys, null, 2));
    return keys;
  }
}
