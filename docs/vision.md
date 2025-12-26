---
layout: default
title: Vision
nav_order: 2
---

# The Vision Blueprint

**Commi** is a decentralized social layer that treats every URL on the internet as a "public square." It allows anyone to annotate the web, creating a global conversation that no single company controls.

## The Core Concept
Today's web relies on "Platform-based Trust"—we trust CEOs and corporations to moderate content and manage our identities. Commi moves the web toward **"Protocol-based Trust"**, where trust is established through mathematics, cryptography, and community reputation.

## How It Works

Commi is built on four key layers: **Transport**, **Identity**, **Defense**, and **Aggregation**.

> For a detailed breakdown of the architecture and data flow, please see the [System Overview](system_overview.md).

## Why This Matters

### For the General User
It feels like a standard browser extension. The complexity of blockchain and federation is hidden behind a clean UI that simply distinguishes between **"Verified Content"** and **"Unverified Noise."**

### For Institutions
It solves GDPR and data sovereignty hurdles. A government or university can host its own data node while still participating in the global conversation.

### For the Web Ecosystem
It creates a **"Web of Trust."** By linking reputation to costly signals (like the age of an account or social history), bot attacks become prohibitively expensive.

## The Ecosystem Strategy (Universal Comments)

Commi is not just an isolated tool; it leverages the existing Fediverse (Mastodon, Threads, Lemmy) as a **Universal Comment Backend**.

### The "Reply Loop"
1.  **Outbound:** When a Commi user annotates a webpage, it appears as a standard post with a link on their ActivityPub profile.
2.  **Inbound:** When a Mastodon user (who doesn't have Commi) replies to that post, Commi ingests the reply.
3.  **Overlay:** The reply is displayed as an annotation on the original webpage.

This turns the entire Fediverse into a comment section for the web. Users on other platforms participate in the conversation natively, while Commi aggregates their insights directly onto the page.


## Conclusion
Commi provides a scalable, accessible, and bot-resistant way for humanity to comment on the digital world without a central gatekeeper.
