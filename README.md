# Commi

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Deno](https://img.shields.io/badge/deno-v2.x-black?logo=deno)
![CI](https://github.com/commi-org/commi/actions/workflows/ci.yml/badge.svg)
![Status](https://img.shields.io/badge/status-prototype-orange)

**Commi** is a decentralized social layer that treats every URL on the internet as a "public square." It allows anyone to annotate the web using ActivityPub, creating a global conversation that no single company controls.

For the full architectural blueprint, see [docs/vision.md](docs/vision.md).

## Structure

- **apps/extension**: The Chrome Extension source code (Manifest V3).
- **apps/backend**: The Deno + Hono API server (ActivityPub node).

## Getting Started

### Prerequisites
- [Deno](https://deno.land/) (v2.0+)

### Backend
1. From the root directory, start the server:
   ```bash
   deno task start
   ```
   - The server runs on `http://localhost:8080`.

### Extension
1. Open Chrome and navigate to `chrome://extensions/`.
2. Enable "Developer mode".
3. Click "Load unpacked".
4. Select the `apps/extension` directory from this repository.
5. Open a supported page (e.g., YouTube) to see the sidebar.

## Development

See [apps/backend/README.md](apps/backend/README.md) for backend details.
