import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getOrCreateKeyPair } from './keys.ts';
import { deliverActivity } from './federation.ts';

const app = new Hono();

// --- Configuration ---
const PORT = 8080;
const HOST = `http://localhost:${PORT}`;
const DB_FILE = './annotations.json';
const ACTIVITIES_FILE = './activities.json';
const KEYS = getOrCreateKeyPair();

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

// --- WebFinger ---
app.get('/.well-known/webfinger', (c) => {
  const resource = c.req.query('resource');
  if (!resource || !resource.startsWith('acct:')) {
    return c.json({ error: 'Bad Request' }, 400);
  }
  
  const [_, acct] = resource.split(':');
  const [username] = acct.split('@');

  const actorId = `${HOST}/users/${username}`;

  return c.json({
    subject: resource,
    links: [
      {
        rel: 'self',
        type: 'application/activity+json',
        href: actorId
      }
    ]
  }, 200, { 'Content-Type': 'application/jrd+json' });
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

  // --- Federation Logic ---
  // Automatically federate the new annotation to the admin user on the local instance
  const targetActor = "http://localhost:8081/users/admin";
  const targetInbox = "http://localhost:8081/users/admin/inbox";

  const newAnnotation: Annotation = {
    id: `${HOST}/annotations/${crypto.randomUUID()}`,
    type: 'Note',
    attributedTo: (author && author.startsWith('http')) ? author : `${HOST}/users/guest`,
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
      ...newAnnotation,
      to: [targetActor],
      cc: [],
      tag: [
        {
          type: 'Mention',
          href: targetActor,
          name: '@admin'
        }
      ]
    },
    to: [targetActor],
    cc: []
  };

  const activities = loadActivities();
  activities.push(activity);
  saveActivities(activities);

  // Fire and forget federation (don't block the API response)
  deliverActivity(activity, actorId, targetInbox)
    .then(success => console.log(`Federation to ${targetInbox}: ${success ? 'Success' : 'Failed'}`))
    .catch(err => console.error('Federation error:', err));

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
      publicKeyPem: KEYS.publicKey
    }
  };
  return c.json(actor, 200, { 'Content-Type': 'application/activity+json' });
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
      publicKeyPem: KEYS.publicKey
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

// --- Federation Test Endpoint ---
app.post('/api/federate', async (c) => {
  const body = await c.req.json();
  const { targetInbox, activity } = body;
  
  if (!targetInbox || !activity) {
    return c.json({ error: 'Missing targetInbox or activity' }, 400);
  }

  // Assume acting as 'guest' for now
  const actorId = `${HOST}/users/guest`;
  
  // Ensure activity has actor
  if (!activity.actor) {
    activity.actor = actorId;
  }

  const success = await deliverActivity(activity, actorId, targetInbox);
  
  return c.json({ success });
});

console.log(`Server running on ${HOST}`);

Deno.serve({ port: PORT, hostname: "0.0.0.0" }, app.fetch);
