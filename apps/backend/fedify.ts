import {
  createFederation,
  Person,
  MemoryKvStore,
  Create,
  Note,
  Activity,
  Follow,
  Undo,
  Accept,
  CryptographicKey,
  getDocumentLoader,
  getAuthenticatedDocumentLoader,
  Context,
} from "@fedify/fedify";
import { getOrCreateKeyPair } from "./keys.ts";
import { 
  loadAnnotations, 
  saveAnnotations, 
  type Annotation,
  addFollower,
  removeFollower,
  loadFollowers
} from "./db.ts";

// Initialize Federation
export const fedi = createFederation<void>({
  kv: new MemoryKvStore(),
  documentLoader: getDocumentLoader({ allowPrivateAddress: true }),
  authenticatedDocumentLoaderFactory: (identity) => {
    console.log("Creating authenticated loader for", identity.keyId);
    return getAuthenticatedDocumentLoader(identity, { allowPrivateAddress: true });
  },
  skipSignatureVerification: true, // Disable signature verification for local testing
});

// Hack: Force allowPrivateAddress to true because we can't set it in createFederation
// when using authenticatedDocumentLoaderFactory.
// This is needed for sendActivity to allow sending to localhost inboxes.
(fedi as any).allowPrivateAddress = true;


// Helper to convert PEM to CryptoKey
async function importPemKeys() {
  console.log("Importing PEM keys...");
  try {
    const { publicKey: pubPem, privateKey: privPem } = getOrCreateKeyPair();
    console.log("Keys read from file.");

    // Helper to strip PEM headers and decode Base64
    const pemHeader = /-----BEGIN [^-]+-----/;
    const pemFooter = /-----END [^-]+-----/;
    
    function parsePem(pem: string) {
      const base64 = pem
        .replace(pemHeader, "")
        .replace(pemFooter, "")
        .replace(/\s/g, "");
      return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    }

    const publicKey = await crypto.subtle.importKey(
      "spki",
      parsePem(pubPem),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      true,
      ["verify"]
    );

    const privateKey = await crypto.subtle.importKey(
      "pkcs8",
      parsePem(privPem),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      true,
      ["sign"]
    );
    
    console.log("Keys imported successfully.");
    return { publicKey, privateKey };
  } catch (error) {
    console.error("Error importing keys:", error);
    throw error;
  }
}

// Actor Dispatcher
fedi.setActorDispatcher("/users/{handle}", async (ctx, handle) => {
  try {
    if (handle !== "commi") return null;

    console.log("Generating actor for:", handle);
    const keyPairs = await ctx.getActorKeyPairs(handle);
    console.log("Key pairs retrieved:", keyPairs.length);

    const key = new CryptographicKey({
      id: new URL(`${ctx.getActorUri(handle).href}#main-key`),
      owner: ctx.getActorUri(handle),
      publicKey: keyPairs[0].publicKey,
    });

    const person = new Person({
      id: ctx.getActorUri(handle),
      name: "Commi Bot",
      summary: "I annotate the web.",
      preferredUsername: handle,
      inbox: ctx.getInboxUri(handle),
      outbox: ctx.getOutboxUri(handle),
      followers: ctx.getFollowersUri(handle),
      publicKey: key,
      assertionMethod: key.id,
    });
    console.log("Generated Person:", await person.toJsonLd());
    return person;
  } catch (err) {
    console.error("Error in Actor Dispatcher:", err);
    throw err;
  }
})
.setKeyPairsDispatcher(async (ctx, handle) => {
  if (handle !== "commi") return [];

  // Load keys from existing keys.json
  // In a real app, you might migrate this to Deno KV
  const keys = await importPemKeys();
  return [keys];
});

// Outbox Dispatcher (Required by Fedify even if empty)
fedi.setOutboxDispatcher("/users/{handle}/outbox", async (ctx, handle, options) => {
  return { items: [] };
});

// Followers Dispatcher
fedi.setFollowersDispatcher("/users/{handle}/followers", async (ctx, handle, options) => {
  const followers = loadFollowers();
  const items = followers.map(f => ({ id: new URL(f.id), inboxId: new URL(f.inbox) }));
  return { items };
});

// Logic extracted for testing
export async function processIncomingNote(object: Note) {
  const json = await object.toJsonLd() as any;
  console.log("Received Note JSON:", json);
  
  const content = json.content?.toString() || "";
  const attributedTo = json.attributedTo?.toString() || "unknown";
  const id = json.id?.toString() || `temp-${Date.now()}`;
  const published = json.published?.toString() || new Date().toISOString();
  const inReplyTo = json.inReplyTo?.toString();

  let target = { href: "" };

  // 1. Check if it's a reply to an existing annotation
  if (inReplyTo) {
    const all = loadAnnotations();
    const parent = all.find(a => a.id === inReplyTo);
    if (parent) {
      console.log(`Found parent annotation: ${parent.id} for target ${parent.target.href}`);
      // Inherit the target URL so it shows up on the same page
      target = { href: parent.target.href };
    } else {
      console.log(`Parent annotation ${inReplyTo} not found. Storing without target.`);
    }
  }

  if (target.href) {
    const newAnnotation: Annotation = {
      id,
      type: 'Note',
      attributedTo,
      content,
      target,
      published,
      inReplyTo
    };

    const all = loadAnnotations();
    // Avoid duplicates
    if (!all.find(a => a.id === newAnnotation.id)) {
      all.push(newAnnotation);
      saveAnnotations(all);
      console.log("Saved incoming annotation:", newAnnotation.id);
    }
  }
}


export async function processFollow(ctx: Context<void>, follow: Follow) {
  if (follow.objectId?.href !== ctx.getActorUri("commi").href) {
    return;
  }
  const follower = follow.actorId;
  if (!follower) return;

  // 1. Save follower
  let inbox = follower.href + "/inbox"; // Fallback
  try {
    const actor = await ctx.lookupObject(follower);
    if (actor instanceof Person && actor.inboxId) {
      inbox = actor.inboxId.href;
    }
  } catch (e) {
    console.error("Failed to lookup follower actor:", e);
  }

  console.log(`New follower: ${follower.href} (inbox: ${inbox})`);
  addFollower(follower.href, inbox);

  // 2. Send Accept
  const accept = new Accept({
    actor: follow.objectId,
    object: follow,
  });
  await ctx.sendActivity({ handle: "commi" }, { id: follower, inboxId: new URL(inbox) }, accept);
}

export async function processUndo(ctx: Context<void>, undo: Undo) {
  const object = await undo.getObject();
  if (object instanceof Follow) {
    const follower = object.actorId;
    if (follower) {
      console.log(`Removing follower: ${follower.href}`);
      removeFollower(follower.href);
    }
  }
}

// Inbox Listener
export function setupInboxListeners() {
  fedi
    .setInboxListeners("/users/{handle}/inbox", "/inbox")
    .on(Create, async (ctx, create) => {
      const object = await create.getObject();
      if (object instanceof Note) {
        await processIncomingNote(object);
      } else if (object instanceof Person) {
        console.log("Received Person:", object);
      }
    })
    .on(Activity, async (ctx, activity) => {
      console.log("Received generic activity", activity);
    })
    .on(Follow, processFollow)
    .on(Undo, processUndo);
}
