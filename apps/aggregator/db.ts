
export const DB_FILE = './aggregated.json';
export const KEYS_FILE = './keys.json';

export interface AggregatedNote {
  id: string;
  content: string;
  targetUrl: string;
  author: string;
  published: string;
  origin: string; // The instance we got it from
}

export function loadNotes(): AggregatedNote[] {
  try {
    const data = Deno.readTextFileSync(DB_FILE);
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export function saveNotes(notes: AggregatedNote[]) {
  Deno.writeTextFileSync(DB_FILE, JSON.stringify(notes, null, 2));
}

export function addNote(note: AggregatedNote) {
  const notes = loadNotes();
  if (!notes.find(n => n.id === note.id)) {
    notes.push(note);
    saveNotes(notes);
  }
}

import { generateKeyPairSync } from "node:crypto";

export interface KeyPair {
  publicKey: string;
  privateKey: string;
}

export function getOrCreateKeyPair(): KeyPair {
  try {
    const data = Deno.readTextFileSync(KEYS_FILE);
    return JSON.parse(data);
  } catch {
    console.log("Generating new RSA key pair for Aggregator...");
    const { publicKey, privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: "spki",
        format: "pem",
      },
      privateKeyEncoding: {
        type: "pkcs8",
        format: "pem",
      },
    });

    const keys = { publicKey, privateKey };
    Deno.writeTextFileSync(KEYS_FILE, JSON.stringify(keys, null, 2));
    return keys;
  }
}
