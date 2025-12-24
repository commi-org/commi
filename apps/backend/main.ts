import { Hono } from 'hono';
import { cors } from 'hono/cors';

const app = new Hono();

// Add Private Network Access header for all responses
app.use('/*', async (c, next) => {
  await next();
  c.header('Access-Control-Allow-Private-Network', 'true');
});

// Enable CORS for the extension
app.use('/*', cors());

interface Comment {
  id: string;
  videoId: string;
  author: string;
  text: string;
  timestamp: number;
}

const COMMENTS_FILE = './comments.json';

// Helper to load comments
function loadComments(): Comment[] {
  try {
    const data = Deno.readTextFileSync(COMMENTS_FILE);
    return JSON.parse(data);
  } catch (_error) {
    // If file doesn't exist or is invalid, return default
    return [
      {
        id: '1',
        videoId: 'dQw4w9WgXcQ', // Rick Roll ID for testing
        author: 'System',
        text: 'Welcome to Commi comments!',
        timestamp: Date.now(),
      }
    ];
  }
}

// Helper to save comments
function saveComments(comments: Comment[]) {
  try {
    Deno.writeTextFileSync(COMMENTS_FILE, JSON.stringify(comments, null, 2));
  } catch (error) {
    console.error('Failed to save comments:', error);
  }
}

// Initialize comments from file
const comments: Comment[] = loadComments();

app.get('/', (c) => {
  return c.text('Commi API is running!');
});

// Get comments for a video
app.get('/comments/:videoId', (c) => {
  const videoId = c.req.param('videoId');
  const videoComments = comments.filter(c => c.videoId === videoId);
  return c.json(videoComments);
});

// Post a new comment
app.post('/comments', async (c) => {
  try {
    const body = await c.req.json();
    
    if (!body.videoId || !body.text) {
      return c.json({ error: 'Missing videoId or text' }, 400);
    }

    const newComment: Comment = {
      id: crypto.randomUUID(),
      videoId: body.videoId,
      author: body.author || 'Anonymous',
      text: body.text,
      timestamp: Date.now(),
    };

    comments.push(newComment);
    saveComments(comments);
    return c.json({ success: true, comment: newComment }, 201);
  } catch (_e) {
    return c.json({ error: 'Invalid JSON' }, 400);
  }
});

console.log('Server running on http://localhost:8080');
Deno.serve({ port: 8080 }, app.fetch);
