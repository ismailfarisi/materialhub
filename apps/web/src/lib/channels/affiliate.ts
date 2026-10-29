import { api, ensureGuestSessionToken } from "@/lib/api";

const COOKIE = "nl_aff";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

function writeCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${MAX_AGE}; samesite=lax`;
}

/**
 * Reads `?aff=CODE` (falling back to the persisted `nl_aff` cookie), stores
 * it in a 30-day cookie, and registers the attribution + cart code with the
 * API. Best-effort: uses the shared `api` axios instance so credentials and
 * the `x-guest-session` header are attached (required for the backend to
 * resolve a guest session for `/a/track` and to stamp the guest cart via
 * `/cart/affiliate`). Non-blocking — call from a `useEffect` and don't await
 * in the caller.
 */
export async function captureAffiliateRef(): Promise<void> {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const fromQuery = url.searchParams.get("aff");
  const code = (fromQuery || readCookie(COOKIE) || "").trim();
  if (!code) return;
  if (fromQuery) writeCookie(COOKIE, code);

  // Wait for the guest-session bootstrap before posting — without an
  // identity the backend can't resolve a session for /a/track and the cart
  // stamp on /cart/affiliate would target no one.
  await ensureGuestSessionToken();

  await Promise.allSettled([api.post("/a/track", { code }), api.post("/cart/affiliate", { code })]);
}
