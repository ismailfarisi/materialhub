/**
 * Best-effort storefront cache revalidation.
 *
 * The Next.js storefront caches public API reads (`publicGet` in
 * apps/web/src/lib/api-public.ts) under tags such as `cms-page:<slug>`,
 * `category:<slug>`, `categories` and `header-navigation`. After an admin
 * change the backend POSTs those tags to the storefront's
 * `/api/revalidate` route so the change shows at once instead of after the
 * cache TTL.
 *
 * Configuration (both required, otherwise this is a no-op and the storefront
 * falls back to its TTLs):
 * - `WEB_REVALIDATE_URL`: storefront origin, e.g. `https://materialhubuae.com`
 * - `REVALIDATE_SECRET`: shared secret, same value as the storefront's
 *   `REVALIDATE_SECRET` (sent as `x-revalidate-secret`)
 *
 * Never throws and never blocks longer than `timeoutMs`: an admin action must
 * not fail because the storefront is unreachable.
 */
export async function revalidateStorefrontTags(
  tags: Array<string | null | undefined | false>,
  opts: {
    fetchImpl?: typeof fetch;
    env?: Record<string, string | undefined>;
    timeoutMs?: number;
  } = {},
): Promise<boolean> {
  const env = opts.env ?? process.env;
  const url = env.WEB_REVALIDATE_URL;
  const secret = env.REVALIDATE_SECRET;
  const unique = [...new Set(tags.filter((t): t is string => typeof t === "string" && !!t))];
  if (!url || !secret || unique.length === 0) return false;
  try {
    const res = await (opts.fetchImpl ?? fetch)(`${url.replace(/\/+$/, "")}/api/revalidate`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-revalidate-secret": secret },
      body: JSON.stringify({ tags: unique }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 3000),
    });
    if (!res.ok) {
      console.warn(`[storefront-revalidate] ${res.status} for tags ${unique.join(", ")}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[storefront-revalidate] failed:", (err as Error)?.message ?? err);
    return false;
  }
}
