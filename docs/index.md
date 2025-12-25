---
layout: default
title: Home
nav_order: 1
---

# Commi Monorepo

This repository contains the prototype for the Commi application.

For the long-term goals and philosophy of this project, see [Vision](vision.md).
For the ActivityPub specification details, see [ActivityPub Spec](activitypub_spec.md).
For the technical implementation details, see [Data & Event Flow](data_flow.md).
For local development setup, see [Local Federation](local_federation.md).

## Structure

- **apps/extension**: The Chrome Extension source code.
- **apps/backend**: The backend API specification and future implementation.

## Getting Started

### Extension
1. Open Chrome and navigate to `chrome://extensions/`.
2. Enable "Developer mode".
3. Click "Load unpacked".
4. Select the `apps/extension` directory from this repository.
