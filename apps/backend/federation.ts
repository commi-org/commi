import { signRequestHeaders } from "./signature.ts";
import { getOrCreateKeyPair } from "./keys.ts";

const KEYS = getOrCreateKeyPair();

export async function deliverActivity(
  activity: any,
  actorId: string,
  targetInbox: string
) {
  const method = "POST";
  const body = JSON.stringify(activity);
  const url = new URL(targetInbox);
  
  const headers = signRequestHeaders(
    method,
    targetInbox,
    body,
    `${actorId}#main-key`,
    KEYS.privateKey
  );

  console.log(`Delivering activity to ${targetInbox}...`);
  
  let attempt = 0;
  const maxAttempts = 5;
  
  while (attempt < maxAttempts) {
    try {
      const res = await fetch(targetInbox, {
        method,
        headers,
        body,
      });
      
      console.log(`Delivery status: ${res.status} ${res.statusText}`);
      const text = await res.text();
      console.log(`Response: ${text}`);
      
      if (res.ok) return true;
      
      // Retry on 5xx errors
      if (res.status >= 500) {
        console.log(`Retrying due to server error (Attempt ${attempt + 1}/${maxAttempts})...`);
      } else {
        return false; // Don't retry on 4xx errors
      }
    } catch (err) {
      console.error(`Delivery failed (Attempt ${attempt + 1}/${maxAttempts}):`, err);
    }
    
    attempt++;
    if (attempt < maxAttempts) {
      const delay = 1000 * Math.pow(2, attempt); // Exponential backoff: 2s, 4s, 8s, 16s
      await new Promise(r => setTimeout(r, delay));
    }
  }
  
  return false;
}
