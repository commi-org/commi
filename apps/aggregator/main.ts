
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { federation } from '@fedify/hono';
import { fedi } from './fedify.ts';
import { Follow, Note, Create } from "@fedify/fedify";
import { loadNotes } from "./db.ts";
import { configure, getConsoleSink } from "@logtape/logtape";

await configure({
  sinks: { console: getConsoleSink() },
  filters: {},
  loggers: [
    { category: "fedify", level: "info", sinks: ["console"] },
  ],
});

const app = new Hono();
const PORT = 8082;
const HOST = `http://localhost:${PORT}`;

app.use('/*', cors());

// Fedify Middleware
app.use(federation(fedi, (c) => undefined));

// API: Search
app.get('/api/search', (c) => {
  const url = c.req.query('url');
  const notes = loadNotes();
  
  if (url) {
    return c.json(notes.filter(n => n.targetUrl === url));
  }
  return c.json(notes);
});

// API: Subscribe to an instance
app.post('/api/subscribe', async (c) => {
  const { targetActor } = await c.req.json();
  if (!targetActor) return c.json({ error: "Missing targetActor" }, 400);

  try {
    const ctx = fedi.createContext(c.req.raw);
    
    // Create Follow Activity
    const follow = new Follow({
      id: new URL(`${HOST}/activities/${crypto.randomUUID()}`),
      actor: ctx.getActorUri("index"),
      object: new URL(targetActor)
    });

    // Send to target
    // We need to find the inbox of the target
    const person = await ctx.lookupObject(targetActor);
    if (!person || !person.inboxId) {
      return c.json({ error: "Could not resolve target inbox" }, 404);
    }

    await ctx.sendActivity(
      { handle: "index" }, 
      person, 
      follow
    );

    return c.json({ success: true, message: `Follow request sent to ${targetActor}` });
  } catch (e) {
    console.error(e);
    return c.json({ error: e.message }, 500);
  }
});

// API: Send a Reply
app.post('/api/reply', async (c) => {
  const { content, inReplyTo, targetActor } = await c.req.json();
  if (!content || !inReplyTo || !targetActor) {
    return c.json({ error: "Missing required fields" }, 400);
  }

  try {
    const ctx = fedi.createContext(c.req.raw);
    const actorUri = ctx.getActorUri("index");
    
    const activity = {
      "@context": "https://www.w3.org/ns/activitystreams",
      id: `${HOST}/activities/${crypto.randomUUID()}`,
      type: "Create",
      actor: actorUri.href,
      object: {
        id: `${HOST}/notes/${crypto.randomUUID()}`,
        type: "Note",
        attributedTo: actorUri.href,
        content: content,
        inReplyTo: inReplyTo,
        published: new Date().toISOString(),
        to: ["https://www.w3.org/ns/activitystreams#Public"],
      },
      to: ["https://www.w3.org/ns/activitystreams#Public"],
    };

    const create = await Create.fromJsonLd(activity);

    const person = await ctx.lookupObject(targetActor);
    if (!person || !person.inboxId) {
      return c.json({ error: "Could not resolve target inbox" }, 404);
    }

    await ctx.sendActivity(
      { handle: "index" }, 
      person, 
      create
    );

    return c.json({ success: true, message: "Reply sent" });
  } catch (e) {
    console.error(e);
    return c.json({ error: e.message }, 500);
  }
});

console.log(`Aggregator running on ${HOST}`);
fedi.startQueue();
Deno.serve({ port: PORT, hostname: "0.0.0.0" }, app.fetch);
