
import {
  createFederation,
  Person,
  MemoryKvStore,
  Note,
  Create,
  Activity,
  CryptographicKey,
  getDocumentLoader,
  getAuthenticatedDocumentLoader,
  Follow,
  Accept,
  Undo
} from "@fedify/fedify";
import { getOrCreateKeyPair, addNote } from "./db.ts";

export const fedi = createFederation<void>({
  kv: new MemoryKvStore(),
  documentLoader: getDocumentLoader({ allowPrivateAddress: true }),
  authenticatedDocumentLoaderFactory: (identity) => {
    return getAuthenticatedDocumentLoader(identity, { allowPrivateAddress: true });
  },
  skipSignatureVerification: true, // Disable signature verification for local testing
});

(fedi as any).allowPrivateAddress = true;

async function importPemKeys() {
  const { publicKey: pubPem, privateKey: privPem } = getOrCreateKeyPair();
  
  const pemHeader = /-----BEGIN [^-]+-----/;
  const pemFooter = /-----END [^-]+-----/;
  function parsePem(pem: string) {
    const base64 = pem.replace(pemHeader, "").replace(pemFooter, "").replace(/\s/g, "");
    return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  }

  const publicKey = await crypto.subtle.importKey(
    "spki", parsePem(pubPem), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, true, ["verify"]
  );
  const privateKey = await crypto.subtle.importKey(
    "pkcs8", parsePem(privPem), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, true, ["sign"]
  );
  return { publicKey, privateKey };
}

// Actor: @index@localhost:8082
fedi.setActorDispatcher("/users/{handle}", async (ctx, handle) => {
  if (handle !== "index") return null;
  const keyPairs = await ctx.getActorKeyPairs(handle);
  const key = new CryptographicKey({
    id: new URL(`${ctx.getActorUri(handle).href}#main-key`),
    owner: ctx.getActorUri(handle),
    publicKey: keyPairs[0].publicKey,
  });

  return new Person({
    id: ctx.getActorUri(handle),
    name: "Commi Aggregator",
    summary: "I index annotations from across the web.",
    preferredUsername: handle,
    inbox: ctx.getInboxUri(handle),
    outbox: ctx.getOutboxUri(handle),
    publicKey: key,
    assertionMethod: key.id,
  });
})
.setKeyPairsDispatcher(async (ctx, handle) => {
  if (handle !== "index") return [];
  const keys = await importPemKeys();
  return [keys];
});

// Outbox: Dummy dispatcher
fedi.setOutboxDispatcher("/users/{handle}/outbox", async (ctx, handle, options) => {
  return { items: [] };
});

// Inbox: Listen for Create(Note)
fedi.setInboxListeners("/users/{handle}/inbox", "/inbox")
  .on(Create, async (ctx, create) => {
    const object = await create.getObject();
    if (object instanceof Note) {
      const json = await object.toJsonLd() as any;
      console.log("[Aggregator] Received Note:", json.id);
      
      // Extract target URL if available (Commi extension)
      let targetUrl = "";
      if (json.target && json.target.href) {
        targetUrl = json.target.href;
      } else if (json.inReplyTo) {
        // TODO: Resolve parent to find target
        targetUrl = "unknown-reply"; 
      }

      addNote({
        id: json.id,
        content: json.content || "",
        targetUrl,
        author: json.attributedTo,
        published: json.published,
        origin: ctx.getActorUri("index").host // Rough approximation
      });
    }
  })
  .on(Accept, async (ctx, accept) => {
    console.log("[Aggregator] Follow request accepted:", accept.actorId?.href);
  });
