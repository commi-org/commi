# Commi Project Instructions

You are working on **Commi**, a monorepo containing a Chrome Extension and a Deno backend. The goal is to overlay **ActivityPub-style annotations** on web pages (currently focused on YouTube).

## 🏗 Architecture

### Monorepo Structure
- `apps/backend/`: Deno + Hono API server.
- `apps/extension/`: Chrome Extension (Manifest V3).

### Data Flow
1. **Content Script** (`content.js`): Injects sidebar UI. Captures context (text selection, video timestamp).
2. **Message Passing**: Content script delegates network requests to Background script via `chrome.runtime.sendMessage`.
3. **Background Script** (`background.js`): Proxies requests to `http://localhost:8080` to bypass CORS/CSP.
4. **Backend**: Serves/Stores annotations in `annotations.json`.

## 💻 Backend Development (`apps/backend`)

- **Runtime**: Deno.
- **Framework**: [Hono](https://hono.dev/).
- **Persistence**: `annotations.json` (ActivityPub JSON-LD format).
- **API Endpoints**:
  - `GET /api/annotations?url=<url>`: Returns annotations for a specific target URL.
  - `POST /api/annotations`: Creates a new annotation.
- **ActivityPub Types**:
  - **Annotation**: `{ type: 'Note', target: { selector: ... } }`
  - **Selectors**: `TextQuoteSelector` (text selection), `TimestampSelector` (video time).
- **Commands**:
  - Start server: `deno task start` (runs on port 8080).

## 🧩 Extension Development (`apps/extension`)

- **Type**: Chrome Manifest V3.
- **UI**: Vanilla JS + CSS. Injected sidebar (`#commi-sidebar`) and floating toggle (`#commi-floating-toggle`).
- **Communication Pattern**:
  - **NEVER** `fetch` from `content.js`.
  - **ALWAYS** use `chrome.runtime.sendMessage`.
  - **Message Types**:
    - `FETCH_ANNOTATIONS`: `{ type: 'FETCH_ANNOTATIONS', url }`
    - `POST_ANNOTATION`: `{ type: 'POST_ANNOTATION', payload }`
- **Key Files**:
  - `src/content.js`: UI logic, selector generation (TextQuote/Timestamp).
  - `src/background.js`: API proxy logic.

## 🚀 Workflows

- **Running the Stack**:
  1. **Backend**: `cd apps/backend && deno task start`.
  2. **Extension**: Chrome -> `chrome://extensions` -> Load Unpacked -> `apps/extension`.
  3. **Test**: Open a page (e.g., YouTube), click the Commi toggle or sidebar.
- **Debugging**:
  - **Backend**: Terminal output (Deno).
  - **Extension UI**: Chrome DevTools (Elements/Console) on the target tab.
  - **Extension Network**: Inspect "Service Worker" in `chrome://extensions`.

## 📝 Conventions

- **ActivityPub**: Adhere to W3C Annotation standards for data models (`target`, `selector`, `exact`, `prefix`, `suffix`).
- **Styling**: Plain CSS in `src/styles.css`.
- **DOM IDs**: Prefix all injected elements with `commi-` (e.g., `commi-input-area`, `commi-context-preview`).
- **Error Handling**: Background script catches errors and returns `{ success: false, error: message }`.
