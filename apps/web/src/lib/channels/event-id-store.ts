/**
 * sessionStorage-backed cache of `event_id` values for browser-side analytics
 * events.
 *
 * The cache is keyed by `(eventName, dedupKey?)`. Non-deduped events (PageView,
 * ViewContent, etc.) use the bare event name. Purchase MUST pass the order id
 * as the dedupKey so a page refresh re-fires the SAME id — this is the dedup
 * contract Google honors when the same `transaction_id` arrives both via
 * gtag.js (browser) and the Enhanced Conversions Adjustment upload (server).
 *
 * Each entry has a 7-day TTL; expired entries are pruned opportunistically on
 * write. `crypto.randomUUID()` provides the id (available in modern browsers
 * and in jsdom).
 */

const STORAGE_KEY = "materialhub_event_ids";
const TTL_DAYS = 7;
const TTL_MS = TTL_DAYS * 24 * 60 * 60 * 1000;

interface Entry {
  id: string;
  expiresAt: number;
}

/** key = `${eventName}:${dedupKey}` for Purchase, just `${eventName}` otherwise */
type Store = Record<string, Entry>;

function read(): Store {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    return {};
  }
}

function write(s: Store): void {
  if (typeof window !== "undefined") {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  }
}

export function getOrCreateEventId(
  eventName: string,
  dedupKey?: string,
): string {
  const k = dedupKey ? `${eventName}:${dedupKey}` : eventName;
  const s = read();
  const existing = s[k];
  const now = Date.now();
  if (existing && existing.expiresAt > now) return existing.id;

  const id = crypto.randomUUID();
  s[k] = { id, expiresAt: now + TTL_MS };

  // Prune stale entries opportunistically.
  for (const key of Object.keys(s)) {
    const entry = s[key];
    if (entry && entry.expiresAt < now) delete s[key];
  }

  write(s);
  return id;
}
