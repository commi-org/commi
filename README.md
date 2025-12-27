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
- **apps/aggregator**: The Federation Aggregator that indexes annotations from multiple nodes.
- **scripts/**: Helper scripts for setup and verification.

## Getting Started

### Prerequisites
- [Deno](https://deno.land/) (v2.0+)

### 1. Start the Services
You need to run both the Backend (User Node) and the Aggregator (Index Node).

**Terminal 1 (Backend):**
```bash
deno task start
```
- Runs on `http://localhost:8080`.

**Terminal 2 (Aggregator):**
```bash
deno task --cwd apps/aggregator start
```
- Runs on `http://localhost:8082`.

### 2. Connect Services (Federation Setup)
Once both services are running, run this script to register a demo user and subscribe the Aggregator to the Backend:

```bash
deno run --allow-net scripts/connect_services.ts
```

### 3. Load the Extension
1. Open Chrome and navigate to `chrome://extensions/`.
2. Enable "Developer mode".
3. Click "Load unpacked".
4. Select the `apps/extension` directory from this repository.
5. Open a supported page (e.g., YouTube) to see the sidebar.

### 4. Verify Federation
To ensure the "Reply Loop" is working (Backend -> Aggregator -> Extension), run:

```bash
deno run --allow-net scripts/verify_federation.ts
```

## Development

See [apps/backend/README.md](apps/backend/README.md) for backend details.
