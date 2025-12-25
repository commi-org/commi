# Local Federation Setup

This document describes how to set up a local development environment to test ActivityPub federation between the **Commi Backend** and a local **GoToSocial** instance (acting as a Mastodon-compatible server).

## Overview

We use **GoToSocial** running in Docker to simulate a remote ActivityPub server. The Commi backend is configured to:
1.  Expose a `/.well-known/webfinger` endpoint for discovery.
2.  Generate RSA keys for HTTP Signatures.
3.  Sign outgoing requests to the GoToSocial inbox.
4.  Deliver `Create` activities containing `Note` objects.

## Prerequisites

- Docker & Docker Compose
- Deno

## 1. Start GoToSocial

We use a custom `docker-compose.yml` configured for local, insecure HTTP federation.

```bash
# In the root of the monorepo
docker compose up -d
```

This starts GoToSocial on `http://localhost:8081`.

### Configuration Highlights
The `docker-compose.yml` includes specific settings to allow local federation:
- `GTS_HTTP_CLIENT_ALLOW_IPS=127.0.0.1/32,::1/128`: Allows GoToSocial to talk to localhost.
- `GTS_HTTP_CLIENT_INSECURE_OUTGOING=true`: Allows HTTP (non-HTTPS) connections.
- `GTS_PROTOCOL=http`: Runs the server in HTTP mode.
- `network_mode: "host"`: Ensures `localhost` inside the container resolves to the host machine, allowing GoToSocial to fetch actors/activities from the Commi backend.

## 2. Create a Test User on GoToSocial

You need a user on the GoToSocial instance to receive messages.

```bash
docker exec gotosocial /gotosocial/gotosocial admin account create \
  --username admin \
  --email admin@example.com \
  --password 'StrongPassword123!'
```

This creates the user `@admin@localhost:8081`.

## 3. Start the Commi Backend

The backend will automatically generate an RSA key pair (`apps/backend/keys.json`) on first run.

```bash
cd apps/backend
deno task start
```

The server runs on `http://localhost:8080`.

## 4. Trigger Federation

Send a POST request to the backend to create an annotation. The backend is hardcoded to federate this to `@admin@localhost:8081`.

```bash
curl -X POST -H "Content-Type: application/json" -d '{
  "content": "Hello Federated World!",
  "target": {
    "href": "https://example.com",
    "selector": {
      "type": "TextQuoteSelector",
      "exact": "Example Domain"
    }
  }
}' http://localhost:8080/api/annotations
```

## 5. Verify Delivery

Check the GoToSocial database to see if the status was created:

```bash
sqlite3 ./gotosocial_data/sqlite.db "SELECT id, content, uri FROM statuses ORDER BY created_at DESC LIMIT 5;"
```

You should see your message in the output.

## Troubleshooting

- **"Receiver does not follow requester"**: GoToSocial requires an explicit `Mention` tag in the ActivityPub object if the receiver does not follow the sender. The backend automatically adds this tag for the `@admin` user.
- **Connection Refused**: Ensure `network_mode: "host"` is set in `docker-compose.yml`.
- **Logs**: Check GoToSocial logs with `docker compose logs -f`.
