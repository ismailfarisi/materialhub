const KEYS = ["gclid", "gbraid", "wbraid"] as const;
type GclidKey = (typeof KEYS)[number];
const STORAGE_KEY = "materialhub_gclid";
const TTL_DAYS = 90;

interface Stored {
  values: Partial<Record<GclidKey, string>>;
  expiresAt: number;
}

export function captureGclidFromLocation(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const captured: Partial<Record<GclidKey, string>> = {};
  for (const k of KEYS) {
    const v = url.searchParams.get(k);
    if (v) captured[k] = v;
  }
  if (Object.keys(captured).length === 0) return;

  // Merge with any existing stored values (preserve previously captured gclid
  // if the current URL has only gbraid, etc.).
  const existing = readStored();
  const merged: Stored = {
    values: { ...(existing?.values ?? {}), ...captured },
    expiresAt: Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000,
  };
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
}

export function readGclid(): string | null {
  return readStored()?.values.gclid ?? null;
}

export function readAllClickIds(): Partial<Record<GclidKey, string>> {
  return readStored()?.values ?? {};
}

function readStored(): Stored | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Stored;
    if (parsed.expiresAt < Date.now()) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
