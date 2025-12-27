import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { federation } from '@fedify/hono';
import { Activity } from '@fedify/fedify';
import { fedi, setupInboxListeners } from './fedify.ts';
import { configure, getConsoleSink } from "@logtape/logtape";

await configure({
  sinks: { console: getConsoleSink() },
  filters: {},
  loggers: [
    { category: "fedify", level: "debug", sinks: ["console"] },
  ],
});

// Setup Fedify Listeners
setupInboxListeners();

const app = new Hono();

// --- Logging ---
const LOG_FILE = './backend.log';
function logToFile(msg: string) {
  Deno.writeTextFileSync(LOG_FILE, msg + '\n', { append: true });
}
const originalLog = console.log;
const originalError = console.error;
console.log = (...args) => {
  originalLog(...args);
  logToFile(`[LOG] ${args.join(' ')}`);
};
console.error = (...args) => {
  originalError(...args);
  logToFile(`[ERROR] ${args.join(' ')}`);
};

app.onError((err, c) => {
  console.error('Hono Error:', err);
  return c.text(`Internal Server Error: ${err.message}\n${err.stack}`, 500);
});

// --- Configuration ---
const PORT = 8080;
const HOST = `http://localhost:${PORT}`;

import { 
  loadAnnotations, 
  saveAnnotations, 
  loadActivities, 
  saveActivities, 
  loadFollowers,
  type Annotation, 
} from './db.ts';

// --- Middleware ---
// Simple Rate Limiter (50 req/sec per IP)
const rateLimitMap = new Map<string, number[]>();
app.use('/*', async (c, next) => {
  const ip = c.req.header('x-forwarded-for') || 'unknown';
  const now = Date.now();
  let timestamps = rateLimitMap.get(ip) || [];
  
  // Remove timestamps older than 1 second
  timestamps = timestamps.filter(t => now - t < 1000);
  
  if (timestamps.length >= 50) {
     return c.json({ error: 'Too Many Requests' }, 429);
  }
  
  timestamps.push(now);
  rateLimitMap.set(ip, timestamps);
  await next();
});

app.use('/*', cors());
app.use('/*', async (c, next) => {
  await next();
  c.header('Access-Control-Allow-Private-Network', 'true');
});

// --- Fedify Middleware ---
// Handles /.well-known/webfinger, /users/:handle, /inbox, etc.
app.use(federation(fedi, (c) => {
  console.log(`[Fedify] Processing: ${c.req.raw.url}`);
  return undefined;
}));

// --- API Endpoints ---

// 1. Get Annotations for a URL
app.get('/api/annotations', (c) => {
  const url = c.req.query('url');
  if (!url) return c.json({ error: 'Missing url parameter' }, 400);

  const all = loadAnnotations();
  // Filter by target URL (simple exact match for now)
  // In a real app, we might normalize URLs
  const filtered = all.filter(a => a.target.href === url || url.includes(a.target.href));
  
  return c.json(filtered);
});

// 2. Create Annotation
app.post('/api/annotations', async (c) => {
  const body = await c.req.json();
  const { content, target, author } = body;

  if (!content || !target || !target.href) {
    return c.json({ error: 'Invalid input' }, 400);
  }

  // --- Federation Logic ---
  const followers = loadFollowers();
  const followerIds = followers.map(f => f.id);
  
  // Always CC followers
  const cc = [...followerIds];

  const newAnnotation: Annotation = {
    id: `${HOST}/annotations/${crypto.randomUUID()}`,
    type: 'Note',
    attributedTo: (author && author.startsWith('http')) ? author : `${HOST}/users/commi`,
    content,
    target: {
      href: target.href,
      selector: target.selector
    },
    published: new Date().toISOString(),
    to: ['https://www.w3.org/ns/activitystreams#Public'],
    cc
  };

  const all = loadAnnotations();
  all.push(newAnnotation);
  saveAnnotations(all);

  const actorId = newAnnotation.attributedTo;

  const activity = {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: `${HOST}/activities/${crypto.randomUUID()}`,
    type: "Create",
    actor: actorId,
    object: {
      id: newAnnotation.id,
      type: "Note",
      content: newAnnotation.content,
      attributedTo: actorId,
      published: newAnnotation.published,
      to: ["https://www.w3.org/ns/activitystreams#Public"],
      cc
    },
    to: ["https://www.w3.org/ns/activitystreams#Public"],
    cc
  };

  const activities = loadActivities();
  activities.push(activity);
  saveActivities(activities);

  // Send Activity via Fedify
  try {
    const ctx = fedi.createContext(c.req.raw);
    const fedifyActivity = await Activity.fromJsonLd(activity);
    
    if (followers.length > 0) {
      const recipients = followers.map(f => ({
        id: new URL(f.id),
        inboxId: new URL(f.inbox)
      }));
      await ctx.sendActivity({ handle: 'commi' }, recipients, fedifyActivity);
      console.log(`Activity sent to ${followers.length} followers`);
    } else {
      console.log('No followers to send to.');
    }
  } catch (err) {
    console.error('Failed to send activity:', err);
  }

  return c.json(newAnnotation, 201);
});

// 4. Get Annotation by ID
app.get('/annotations/:id', (c) => {
  const id = c.req.param('id');
  const fullId = `${HOST}/annotations/${id}`;
  const all = loadAnnotations();
  const found = all.find(a => a.id === fullId);
  
  if (!found) return c.json({ error: 'Not Found' }, 404);
  
  return c.json(found, 200, { 'Content-Type': 'application/activity+json' });
});

// 5. Get Activity by ID
app.get('/activities/:id', (c) => {
  const id = c.req.param('id');
  const fullId = `${HOST}/activities/${id}`;
  const all = loadActivities();
  const found = all.find(a => a.id === fullId);
  
  if (!found) return c.json({ error: 'Not Found' }, 404);
  
  return c.json(found, 200, { 'Content-Type': 'application/activity+json' });
});

console.log(`Server running on ${HOST}`);

// Start the federation queue worker
fedi.startQueue();

Deno.serve({ port: PORT, hostname: "0.0.0.0" }, app.fetch);
