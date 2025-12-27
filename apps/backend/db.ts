
export const DB_FILE = './annotations.json';
export const ACTIVITIES_FILE = './activities.json';

// --- Types ---
export interface Selector {
  type: 'TextQuoteSelector' | 'DOMSelector' | 'TimestampSelector';
  exact?: string;
  prefix?: string;
  suffix?: string;
  start?: string; // ISO 8601 duration or seconds
  end?: string;
  value?: string; // CSS selector
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

// --- Persistence ---
export function loadAnnotations(): Annotation[] {
  try {
    const data = Deno.readTextFileSync(DB_FILE);
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export function saveAnnotations(annotations: Annotation[]) {
  Deno.writeTextFileSync(DB_FILE, JSON.stringify(annotations, null, 2));
}

export function loadActivities(): any[] {
  try {
    const data = Deno.readTextFileSync(ACTIVITIES_FILE);
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export function saveActivities(activities: any[]) {
  Deno.writeTextFileSync(ACTIVITIES_FILE, JSON.stringify(activities, null, 2));
}
