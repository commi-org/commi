
import { generateKeyPairSync } from "node:crypto";

const KV_PATH = Deno.env.get("KV_PATH");
export const kv = await Deno.openKv(KV_PATH);

// --- Types ---
export interface Selector {
  type: 'TextQuoteSelector' | 'DOMSelector' | 'TimestampSelector';
  exact?: string;
  prefix?: string;
  suffix?: string;
  start?: string;
  end?: string;
  value?: string;
}

export interface Annotation {
  id: string;
  type: 'Note';
  attributedTo: string;
  content: string;
  target: {
    href: string;
    selector?: Selector;
  };
  published: string;
  to?: string[];
  cc?: string[];
  inReplyTo?: string;
}

export interface User {
  id: string; // URI
  username: string;
  email: string;
  passwordHash: string;
  publicKey: string; // PEM
  privateKey: string; // PEM
  createdAt: string;
}

export interface Follower {
  id: string; // Actor URI
  inbox: string;
}

// --- User Management ---

export async function createUser(username: string, email: string, passwordHash: string, host: string): Promise<User> {
  const id = `${host}/users/${username}`;
  
  // Generate Keys
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  const user: User = {
    id,
    username,
    email,
    passwordHash,
    publicKey,
    privateKey,
    createdAt: new Date().toISOString(),
  };

  const res = await kv.atomic()
    .check({ key: ["users", username], versionstamp: null }) // Ensure unique username
    .check({ key: ["emails", email], versionstamp: null })   // Ensure unique email
    .set(["users", username], user)
    .set(["emails", email], username)
    .commit();

  if (!res.ok) {
    throw new Error("Username or email already exists");
  }

  return user;
}

export async function getUser(username: string): Promise<User | null> {
  const res = await kv.get<User>(["users", username]);
  return res.value;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const res = await kv.get<string>(["emails", email]);
  if (!res.value) return null;
  return getUser(res.value);
}

// --- Annotations ---

export async function saveAnnotation(annotation: Annotation) {
  await kv.set(["annotations", annotation.id], annotation);
  // Index by target URL for faster lookup
  await kv.set(["annotations_by_target", annotation.target.href, annotation.id], annotation);
}

export async function loadAnnotations(url?: string): Promise<Annotation[]> {
  const annotations: Annotation[] = [];
  
  if (url) {
    const iter = kv.list<Annotation>({ prefix: ["annotations_by_target", url] });
    for await (const entry of iter) {
      annotations.push(entry.value);
    }
  } else {
    const iter = kv.list<Annotation>({ prefix: ["annotations"] });
    for await (const entry of iter) {
      annotations.push(entry.value);
    }
  }
  return annotations;
}

export async function getAnnotation(id: string): Promise<Annotation | null> {
  const res = await kv.get<Annotation>(["annotations", id]);
  return res.value;
}

// --- Activities ---

export async function saveActivity(activity: any) {
  await kv.set(["activities", activity.id], activity);
}

export async function loadActivities(): Promise<any[]> {
  const activities: any[] = [];
  const iter = kv.list<any>({ prefix: ["activities"] });
  for await (const entry of iter) {
    activities.push(entry.value);
  }
  return activities;
}

export async function getActivity(id: string): Promise<any | null> {
  const res = await kv.get<any>(["activities", id]);
  return res.value;
}

// --- Followers ---

export async function addFollower(actorId: string, inbox: string) {
  const follower: Follower = { id: actorId, inbox };
  await kv.set(["followers", actorId], follower);
}

export async function removeFollower(actorId: string) {
  await kv.delete(["followers", actorId]);
}

export async function loadFollowers(): Promise<Follower[]> {
  const followers: Follower[] = [];
  const iter = kv.list<Follower>({ prefix: ["followers"] });
  for await (const entry of iter) {
    followers.push(entry.value);
  }
  return followers;
}

