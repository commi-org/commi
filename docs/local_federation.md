# Local Federation Testing

This document describes how to test ActivityPub federation between the **Commi Backend** and a local **GoToSocial** instance.

## Overview

We use **GoToSocial** running in Docker to simulate a remote ActivityPub server. The Commi backend:
1. Exposes `/.well-known/webfinger` for discovery
2. Signs outgoing requests with HTTP Signatures
3. Delivers `Create` activities containing `Note` objects
4. Receives and processes incoming activities via inbox

## Quick Start

```bash
# 1. Start GoToSocial
docker compose up -d

# 2. Start Commi backend (in another terminal)
cd apps/backend
deno task start

# 3. Run automated E2E test
deno task test:e2e
```

The E2E test automatically:
- Creates a test annotation on Commi
- Waits for it to federate to GoToSocial
- Posts a reply from GoToSocial
- Verifies the reply appears in Commi's annotations

## Manual Testing

### Create an annotation via API:
```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"content": "Hello Federated World!", "target": {"href": "https://example.com", "selector": {"type": "TextQuoteSelector", "exact": "Example Domain"}}}' \
  http://localhost:8080/api/annotations
```

### Verify it federated to GoToSocial:
```bash
sqlite3 ./gotosocial_data/sqlite.db \
  "SELECT id, content FROM statuses ORDER BY created_at DESC LIMIT 5;"
```

### Check inbound delivery logs:
```bash
tail -f apps/backend/backend.log | grep "Received Note"
```

## Configuration

The `docker-compose.yml` includes settings for local HTTP federation:
- `GTS_HTTP_CLIENT_ALLOW_IPS=127.0.0.1/32,::1/128`: Localhost connections
- `GTS_HTTP_CLIENT_INSECURE_OUTGOING=true`: Allow HTTP (non-HTTPS)
- `GTS_PROTOCOL=http`: Run server in HTTP mode
- `network_mode: "host"`: GoToSocial can reach Commi at `localhost:8080`

## Troubleshooting

- **E2E test fails**: Ensure both Docker and backend are running
- **Connection Refused**: Check `network_mode: "host"` in docker-compose.yml
- **Admin user errors**: The E2E test auto-creates the admin user if needed
- **View GoToSocial logs**: `docker compose logs -f gotosocial`
- **View Commi logs**: `tail -f apps/backend/backend.log`
