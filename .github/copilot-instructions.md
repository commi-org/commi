# Commi Project Instructions

You are working on **Commi**, a monorepo containing a Chrome Extension and a Deno backend. The goal is to overlay custom comments on YouTube videos.

## 🏗 Architecture

### Monorepo Structure
- `apps/backend/`: Deno + Hono API server.
- `apps/extension/`: Chrome Extension (Manifest V3).

### Data Flow
1. **Content Script** (`content.js`): Injects UI into YouTube. Detects video ID from URL.
2. **Message Passing**: Content script sends messages (`FETCH_COMMENTS`, `POST_COMMENT`) to the Background script.
3. **Background Script** (`background.js`): Proxies requests to the Backend API (`http://localhost:8080`) to avoid CSP/CORS issues.
4. **Backend**: Handles requests, reads/writes to `comments.json`.

## 💻 Backend Development (`apps/backend`)

- **Runtime**: Deno.
- **Framework**: [Hono](https://hono.dev/).
- **Persistence**: Simple JSON file (`comments.json`).
- **API Endpoints**:
  - `GET /comments/:videoId`: Returns array of comments.
  - `POST /comments`: Accepts `{ videoId, text, author? }`.
- **Commands**:
  - Start server: `deno task start` (runs on port 8080).
- **Key Files**:
  - `main.ts`: Single-file server implementation.
  - `deno.json`: Task definitions and import maps.

## 🧩 Extension Development (`apps/extension`)

- **Type**: Chrome Manifest V3.
- **UI**: Vanilla JS + CSS injected into the DOM (`#commi-sidebar`).
- **Communication Pattern**:
  - **DO NOT** call `fetch` directly from `content.js`.
  - **ALWAYS** use `chrome.runtime.sendMessage` to delegate network requests to `background.js`.
  - **Message Types**:
    - `FETCH_COMMENTS`: `{ type: 'FETCH_COMMENTS', videoId }`
    - `POST_COMMENT`: `{ type: 'POST_COMMENT', payload: { videoId, text } }`
- **Key Files**:
  - `manifest.json`: Permissions (`storage`, host permissions for YouTube/Localhost).
  - `src/content.js`: UI logic, DOM manipulation, message dispatch.
  - `src/background.js`: API proxy logic.

## 🚀 Workflows

- **Running the Stack**:
  1. Start backend: `cd apps/backend && deno task start`.
  2. Load extension: Chrome -> `chrome://extensions` -> Load Unpacked -> `apps/extension`.
  3. Test: Open a YouTube video.
- **Debugging**:
  - **Backend**: Check terminal output.
  - **Extension UI**: Chrome DevTools on the YouTube tab.
  - **Extension Logic**: Inspect the "Service Worker" in `chrome://extensions`.

## 📝 Conventions

- **Backend**: Use TypeScript.
- **Extension**: Use Vanilla JavaScript (ES6+).
- **Styling**: Plain CSS in `src/styles.css`.
- **IDs**: Prefix DOM elements with `commi-` (e.g., `commi-sidebar`, `commi-submit-btn`).
- **Error Handling**: Background script catches fetch errors and returns `{ success: false, error: message }`.
