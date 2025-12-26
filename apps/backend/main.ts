import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { federation } from '@fedify/hono';
import { Activity } from '@fedify/fedify';
import { fedi } from './fedify.ts';
import { configure, getConsoleSink } from "@logtape/logtape";

await configure({
  sinks: { console: getConsoleSink() },
  filters: {},
  loggers: [
    { category: "fedify", level: "debug", sinks: ["console"] },
  ],
});

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
const DB_FILE = './annotations.json';
const ACTIVITIES_FILE = './activities.json';

// --- Types ---
interface Selector {
  type: 'TextQuoteSelector' | 'DOMSelector' | 'TimestampSelector';
  exact?: string;
  prefix?: string;
  suffix?: string;
  start?: string; // ISO 8601 duration or seconds
  end?: string;
  value?: string; // CSS selector
}

interface Annotation {
  id: string;
  type: 'Note';
  attributedTo: string;
  content: string;
  target: {
    href: string;
    selector?: Selector;
  };
  published: string;
  to?: string[];
  cc?: string[];
}

// --- Persistence ---
function loadAnnotations(): Annotation[] {
  try {
    const data = Deno.readTextFileSync(DB_FILE);
    return JSON.parse(data);
  } catch {
    return [];
  }
}

function saveAnnotations(annotations: Annotation[]) {
  Deno.writeTextFileSync(DB_FILE, JSON.stringify(annotations, null, 2));
}

function loadActivities(): any[] {
  try {
    const data = Deno.readTextFileSync(ACTIVITIES_FILE);
    return JSON.parse(data);
  } catch {
    return [];
  }
}

function saveActivities(activities: any[]) {
  Deno.writeTextFileSync(ACTIVITIES_FILE, JSON.stringify(activities, null, 2));
}

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
  console.log(`[Fedify] Processing: ${c.req.url}`);
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
  // Automatically federate the new annotation to the admin user on the local instance
  const targetActor = "http://localhost:8081/users/admin";
  // const targetInbox = "http://localhost:8081/users/admin/inbox"; // Handled by Fedify later

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
    cc: [targetActor]
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
      content: `${newAnnotation.content}\n\n@admin@localhost:8081`,
      attributedTo: actorId,
      published: newAnnotation.published,
      to: ["https://www.w3.org/ns/activitystreams#Public"],
      cc: [targetActor],
      tag: [
        {
          type: 'Mention',
          href: targetActor,
          name: '@admin@localhost:8081'
        }
      ],
      // Store annotation-specific metadata in attachment for ActivityPub compatibility
      attachment: newAnnotation.target ? [{
        type: 'Link',
        href: newAnnotation.target.href,
        name: 'annotation-target',
        mediaType: 'application/json',
        summary: JSON.stringify(newAnnotation.target.selector)
      }] : []
    },
    to: ["https://www.w3.org/ns/activitystreams#Public"],
    cc: [targetActor]
  };

  const activities = loadActivities();
  activities.push(activity);
  saveActivities(activities);

  // Send Activity via Fedify
  try {
    const ctx = fedi.createContext(c.req.raw);
    const fedifyActivity = await Activity.fromJsonLd(activity);
    await ctx.sendActivity({ handle: 'commi' }, [targetActor], fedifyActivity);
    console.log('Activity sent to', targetActor);
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
