import { Hono } from 'hono';
import { cors } from 'hono/cors';

const app = new Hono();

// --- Configuration ---
const PORT = 8080;
const HOST = `http://localhost:${PORT}`;
const DB_FILE = './annotations.json';

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
}

interface Actor {
  "@context": string[];
  id: string;
  type: 'Person';
  preferredUsername: string;
  inbox: string;
  outbox: string;
  publicKey: {
    id: string;
    owner: string;
    publicKeyPem: string;
  };
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

  const newAnnotation: Annotation = {
    id: `${HOST}/annotations/${crypto.randomUUID()}`,
    type: 'Note',
    attributedTo: author || `${HOST}/users/guest`,
    content,
    target: {
      href: target.href,
      selector: target.selector
    },
    published: new Date().toISOString()
  };

  const all = loadAnnotations();
  all.push(newAnnotation);
  saveAnnotations(all);

  return c.json(newAnnotation, 201);
});

// --- ActivityPub Endpoints ---

// 3. Actor Profile
app.get('/users/:name', (c) => {
  const name = c.req.param('name');
  const id = `${HOST}/users/${name}`;
  
  const actor: Actor = {
    "@context": [
      "https://www.w3.org/ns/activitystreams",
      "https://w3id.org/security/v1"
    ],
    id,
    type: "Person",
    preferredUsername: name,
    inbox: `${id}/inbox`,
    outbox: `${id}/outbox`,
    publicKey: {
      id: `${id}#main-key`,
      owner: id,
      publicKeyPem: "-----BEGIN PUBLIC KEY-----\n...MOCK KEY...\n-----END PUBLIC KEY-----"
    }
  };

  return c.json(actor, 200, { 'Content-Type': 'application/activity+json' });
});

// 4. Outbox (Public Feed)
app.get('/users/:name/outbox', (c) => {
  const name = c.req.param('name');
  const id = `${HOST}/users/${name}`;
  const all = loadAnnotations();
  const userAnnotations = all.filter(a => a.attributedTo === id);

  const collection = {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: `${id}/outbox`,
    type: "OrderedCollection",
    totalItems: userAnnotations.length,
    orderedItems: userAnnotations.map(note => ({
      type: "Create",
      actor: id,
      object: note
    }))
  };

  return c.json(collection, 200, { 'Content-Type': 'application/activity+json' });
});

// 5. Inbox (Receive Federation)
app.post('/users/:name/inbox', async (c) => {
  // In a real implementation, we would verify signatures here
  const activity = await c.req.json();
  console.log('Received activity:', activity);
  
  // Process Create activity
  if (activity.type === 'Create' && activity.object && activity.object.type === 'Note') {
    const note = activity.object;
    const all = loadAnnotations();
    // Avoid duplicates
    if (!all.find(a => a.id === note.id)) {
      all.push(note);
      saveAnnotations(all);
    }
  }

  return c.json({ status: 'accepted' }, 202);
});

console.log(`Server running on ${HOST}`);

Deno.serve({ port: PORT }, app.fetch);
