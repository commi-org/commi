import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { federation } from '@fedify/hono';
import { Activity, Announce } from '@fedify/fedify';
import { sign, verify } from 'hono/jwt';
import { fedi, setupInboxListeners } from './fedify.ts';
import { configure, getConsoleSink } from "@logtape/logtape";
import { 
  loadAnnotations, 
  saveAnnotation, 
  saveActivity, 
  loadFollowers,
  createUser,
  getUser,
  getUserByEmail,
  getAnnotation,
  getActivity,
  type Annotation, 
} from './db.ts';

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
const JWT_SECRET = "commi-secret-key-change-me"; // In prod, use env var

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

// --- Helpers ---
async function hashPassword(password: string) {
  const msgBuffer = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
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
  console.log(`[Fedify] Processing: ${c.req.raw.url}`);
  return undefined;
}));

// --- Auth Endpoints ---

// Register
app.post('/api/v1/accounts', async (c) => {
  const { username, email, password } = await c.req.json();
  if (!username || !email || !password) {
    return c.json({ error: 'Missing fields' }, 400);
  }

  try {
    const passwordHash = await hashPassword(password);
    const user = await createUser(username, email, passwordHash, HOST);
    
    // Issue Token
    const token = await sign({ id: user.id, username: user.username, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30 }, JWT_SECRET); // 30 days

    return c.json({ access_token: token, token_type: 'Bearer', ...user });
  } catch (e) {
    return c.json({ error: e.message }, 400);
  }
});

// Login (OAuth 2.0 Password Grant)
app.post('/oauth/token', async (c) => {
  const body = await c.req.parseBody(); // Handle form-data or json
  const grantType = body['grant_type'];
  const username = body['username'] as string; // Can be email
  const password = body['password'] as string;

  if (grantType !== 'password') {
    return c.json({ error: 'unsupported_grant_type' }, 400);
  }

  let user = await getUser(username);
  if (!user) {
    // Try email
    user = await getUserByEmail(username);
  }

  if (!user) {
    return c.json({ error: 'invalid_client' }, 401);
  }

  const hash = await hashPassword(password);
  if (hash !== user.passwordHash) {
    return c.json({ error: 'invalid_client' }, 401);
  }

  const token = await sign({ id: user.id, username: user.username, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30 }, JWT_SECRET);

  return c.json({
    access_token: token,
    token_type: 'Bearer',
    scope: 'read write',
    created_at: Math.floor(Date.now() / 1000)
  });
});

// Verify Credentials
app.get('/api/v1/accounts/verify_credentials', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  const token = authHeader.split(' ')[1];
  try {
    const payload = await verify(token, JWT_SECRET);
    const user = await getUser(payload.username as string);
    if (!user) return c.json({ error: 'User not found' }, 404);
    return c.json(user);
  } catch {
    return c.json({ error: 'Invalid Token' }, 401);
  }
});


// --- API Endpoints ---

// 1. Get Annotations for a URL
app.get('/api/annotations', async (c) => {
  const url = c.req.query('url');
  if (!url) return c.json({ error: 'Missing url parameter' }, 400);

  const annotations = await loadAnnotations(url);
  return c.json(annotations);
});

// 2. Create Annotation (Protected)
app.post('/api/annotations', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  let user;
  try {
    const token = authHeader.split(' ')[1];
    const payload = await verify(token, JWT_SECRET);
    user = await getUser(payload.username as string);
  } catch {
    return c.json({ error: 'Invalid Token' }, 401);
  }

  if (!user) return c.json({ error: 'User not found' }, 404);

  const body = await c.req.json();
  const { content, target } = body;

  if (!content || !target || !target.href) {
    return c.json({ error: 'Invalid input' }, 400);
  }

  // --- Federation Logic ---
  const followers = await loadFollowers();
  
  // Always CC followers
  const cc = followers.map(f => f.id);

  const newAnnotation: Annotation = {
    id: `${HOST}/annotations/${crypto.randomUUID()}`,
    type: 'Note',
    attributedTo: user.id,
    content,
    target: {
      href: target.href,
      selector: target.selector
    },
    published: new Date().toISOString(),
    to: ['https://www.w3.org/ns/activitystreams#Public'],
    cc
  };

  await saveAnnotation(newAnnotation);

  const activity = {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: `${HOST}/activities/${crypto.randomUUID()}`,
    type: "Create",
    actor: user.id,
    object: {
      id: newAnnotation.id,
      type: "Note",
      content: newAnnotation.content,
      attributedTo: user.id,
      published: newAnnotation.published,
      to: ["https://www.w3.org/ns/activitystreams#Public"],
      cc,
      // Use 'tag' to transport target URL since Fedify strips 'target' on Note
      tag: [
        {
          type: "Link",
          href: newAnnotation.target.href,
          name: "target"
        }
      ]
    },
    to: ["https://www.w3.org/ns/activitystreams#Public"],
    cc
  };

  await saveActivity(activity);

  // Send Activity via Fedify
  try {
    const ctx = fedi.createContext(c.req.raw);
    const fedifyActivity = await Activity.fromJsonLd(activity);
    
    // 1. Send to User's Followers
    if (followers.length > 0) {
      const recipients = followers.map(f => ({
        id: new URL(f.id),
        inboxId: new URL(f.inbox)
      }));
      await ctx.sendActivity({ identifier: user.username }, recipients, fedifyActivity);
      console.log(`Activity sent to ${followers.length} followers`);
    }

    // 2. Instance Actor Announcement (Wildcard Subscription)
    // The instance actor "boosts" the note to its followers (e.g. Aggregator)
    const instanceActorHandle = "commi-instance";
    const instanceUser = await getUser(instanceActorHandle);
    
    if (instanceUser) {
       // Load instance followers (Aggregator should be following this)
       // Note: In a real app, we'd have separate follower lists per user.
       // Here, loadFollowers() returns ALL followers because our DB is simple.
       // We will filter to find the Aggregator or just broadcast to all for prototype.
       const instanceFollowers = await loadFollowers(); 
       
       if (instanceFollowers.length > 0) {
         const announce = new Announce({
            id: new URL(`${HOST}/activities/${crypto.randomUUID()}`),
            actor: new URL(instanceUser.id),
            object: fedifyActivity
         });
         
         const recipients = instanceFollowers.map(f => ({
            id: new URL(f.id),
            inboxId: new URL(f.inbox)
         }));

         await ctx.sendActivity({ identifier: instanceActorHandle }, recipients, announce);
         console.log(`Instance Actor announced activity to ${recipients.length} followers`);
       }
    }

  } catch (err) {
    console.error('Failed to send activity:', err);
  }

  return c.json(newAnnotation, 201);
});

// 4. Get Annotation by ID
app.get('/annotations/:id', async (c) => {
  const id = c.req.param('id');
  const fullId = `${HOST}/annotations/${id}`;
  const found = await getAnnotation(fullId);
  
  if (!found) return c.json({ error: 'Not Found' }, 404);
  
  return c.json(found, 200, { 'Content-Type': 'application/activity+json' });
});

// 5. Get Activity by ID
app.get('/activities/:id', async (c) => {
  const id = c.req.param('id');
  const fullId = `${HOST}/activities/${id}`;
  const found = await getActivity(fullId);
});

console.log(`Server running on ${HOST}`);

// Start the federation queue worker
fedi.startQueue();

Deno.serve({ port: PORT, hostname: "0.0.0.0" }, app.fetch);
