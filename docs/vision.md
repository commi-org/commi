---
layout: default
title: Vision
nav_order: 2
---

# The Vision Blueprint

**Commi** is a decentralized social layer that treats every URL on the internet as a "public square." It allows anyone to annotate the web, creating a global conversation that no single company controls.

## The Core Concept
Today's web relies on "Platform-based Trust"—we trust CEOs and corporations to moderate content and manage our identities. Commi moves the web toward **"Protocol-based Trust"**, where trust is established through mathematics, cryptography, and community reputation.

## How It Works: The Four Layers

### 1. The Transport Layer (Federation)
*Powered by ActivityPub*

We use the same protocol that powers the Fediverse (Mastodon, Lemmy). This ensures the system is **federated**: Governments, NGOs, and Universities can host their own "instances." This prevents a single entity from owning the world's annotations and ensures the infrastructure can survive even if the original creators disappear.

### 2. The Identity Layer (You Own Your Data)
*Powered by Decentralized Identifiers (DIDs)*

Instead of insecure email logins or "Login with Google," Commi uses portable cryptographic identities (like Sign-In with Ethereum or Passkeys). Your identity and reputation travel with you across the web, not tied to any specific server.

### 3. The Defense Layer (Trust & Reputation)
*Powered by Proof-of-Humanity*

To solve the "bot problem" without censorship, every annotation carries "Trust Metadata." The system prioritizes high-reputation humans in the UI. Unverified accounts or bots are collapsed into a "low-trust" view. This makes spam invisible to most users without requiring a central authority to delete it.

## 4. The Aggregation Layer (Solving Fragmentation)
*Powered by Bridging Algorithms*

To prevent "echo chambers" where users only see what they agree with, Commi relies on **Aggregator Nodes**. These are large servers (run by universities, NGOs, or consortiums) that ingest data from the entire network.

Instead of simple popularity contests, these nodes run **Bridging Algorithms** (like Community Notes) that prioritize content with **cross-partisan consensus**. This gives users the best of both worlds:
1.  **Decentralization**: No single company owns the data.
2.  **Quality**: High-level curation that filters out noise and bias.

## Why This Matters

### For the General User
It feels like a standard browser extension. The complexity of blockchain and federation is hidden behind a clean UI that simply distinguishes between **"Verified Content"** and **"Unverified Noise."**

### For Institutions
It solves GDPR and data sovereignty hurdles. A government or university can host its own data node while still participating in the global conversation.

### For the Web Ecosystem
It creates a **"Web of Trust."** By linking reputation to costly signals (like the age of an account or social history), bot attacks become prohibitively expensive.

## Technical Architecture Summary

| Component | Choice | Benefit |
| :--- | :--- | :--- |
| **Protocol** | ActivityPub | Enables federation and government-hosted nodes. |
| **Reputation** | Verifiable Credentials | Strong anti-bot/Sybil resistance (e.g., Gitcoin Passport). |
| **Logic** | Weighted Trust Graphs | Trust flows from trusted people (e.g., EigenTrust). |
| **Storage** | Federated Storage | Fast, compliant, and easy for institutions to manage. |
| **Interface** | W3C Web Annotations | Universal standard; ensures data is "readable" by any tool. |

## Conclusion
Commi provides a scalable, accessible, and bot-resistant way for humanity to comment on the digital world without a central gatekeeper.
