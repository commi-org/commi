# Commi Project Instructions

You are working on **Commi**, a monorepo containing a Chrome Extension and a Deno backend. The goal is to overlay **ActivityPub-style annotations** on web pages (currently focused on YouTube).

## 🏗 Architecture

### Monorepo Structure
- `apps/backend/`: Deno + Hono API server.
  - `main.ts`: Entry point, API routes, and in-memory rate limiting.
  - `annotations.json`: Flat-file persistence (ActivityPub JSON-LD).
- `apps/extension/`: Chrome Extension (Manifest V3).
  - `src/content.js`: Injected UI (`#commi-sidebar`), DOM manipulation, context capture.
  - `src/background.js`: Service worker acting as API proxy to bypass CORS/CSP.

### Data Flow
1. **User Action**: User selects text or pauses video on YouTube.
2. **Content Script**: Captures context (`TextQuoteSelector` or `TimestampSelector`).
3. **Message Passing**: `content.js` sends `FETCH_ANNOTATIONS` or `POST_ANNOTATION` to `background.js` via `chrome.runtime.sendMessage`.
4. **Proxy**: `background.js` forwards request to `http://localhost:8080` using `fetch`.
5. **Backend**: `main.ts` processes request, updates `annotations.json`, returns JSON.

## 💻 Backend Development (`apps/backend`)

- **Runtime**: Deno (v2.x).
- **Framework**: [Hono](https://hono.dev/) (imported via `npm:hono`).
- **Persistence**: Simple JSON file (`annotations.json`).
- **Key Patterns**:
  - **Rate Limiting**: In-memory `rateLimitMap` (50 req/sec per IP).
  - **CORS**: Enabled for all origins, plus `Access-Control-Allow-Private-Network`.
- **Commands**:
  - Start: `deno task start` (watches `main.ts`, port 8080).
  - Test: `deno test` (runs `integration_test.ts`, `test_api.ts`).

## 🧩 Extension Development (`apps/extension`)

- **Tech Stack**: Vanilla JavaScript, CSS, Chrome Manifest V3.
- **UI Components**:
  - **Sidebar**: `#commi-sidebar` (injected into `document.body`).
  - **Toggle**: `#commi-floating-toggle`.
  - **Prefix**: All IDs/Classes prefixed with `commi-` to avoid collisions.
- **Communication Rules**:
  - **NO** `fetch` in `content.js` (violates CSP on many sites).
  - **ALWAYS** delegate network calls to `background.js`.
  - **Polling**: `content.js` polls for updates every 5s (`POLL_INTERVAL`).

## 📝 ActivityPub Data Model

Adhere to W3C Web Annotation Data Model:
```json
{
  "type": "Note",
  "target": {
    "href": "https://www.youtube.com/watch?v=...",
    "selector": {
      "type": "TextQuoteSelector", // or "TimestampSelector"
      "exact": "selected text",
      "prefix": "text before",
      "suffix": "text after"
    }
  }
}
```

## 🚀 Developer Workflow

1. **Start Backend**: `cd apps/backend && deno task start`.
2. **Load Extension**: Chrome -> `chrome://extensions` -> Load Unpacked -> `apps/extension`.
3. **Debug**:
   - **Backend**: Check terminal for Deno logs.
   - **Content Script**: Chrome DevTools Console on the YouTube tab.
   - **Background Script**: Click "Service Worker" in `chrome://extensions` to inspect network traffic.

## ⚠️ Critical Implementation Details

- **URL Encoding**: `background.js` must `encodeURIComponent(url)` before fetching.
- **Error Handling**: Background script catches fetch errors and returns `{ success: false, error: ... }` so `content.js` doesn't crash.
- **Hot Reload**: Extension changes often require clicking "Reload" in `chrome://extensions` AND refreshing the target web page.
