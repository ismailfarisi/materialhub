import { aedToFils } from "../../lib/money";

export type ServiceUrlParams = Record<string, string | undefined>;

const DEFAULT_LIMIT = 24;

function num(value: string | undefined): number | undefined {
  if (value == null || value === "") return undefined;
  const n = Number(value);
  // Reject non-finite or negative values — bounded domains (duration, rating, page)
  // must not leak negative numbers to the API, just like aedToFils rejects invalid prices.
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/**
 * URL (camelCase, AED) -> API (snake_case, fils).
 *
 * The AED/fils boundary is the important half: `minPrice=20` in the URL means
 * 20 dirhams, but GET /services filters on fils. The product path already
 * shipped this bug once on its result-count query, so BOTH callers here go
 * through this function.
 */
/**
 * URL (camelCase, AED) -> API (snake_case, fils).
 *
 * The AED/fils boundary is the important half: `minPrice=20` in the URL means
 * 20 dirhams, but GET /services filters on fils. The product path already
 * shipped this bug once on its result-count query, so BOTH callers here go
 * through this function.
 *
 * Params are built by explicit allowlist: client-only keys like `view` are
 * excluded by construction, not by cleanup.
 */
export function buildServiceListingParams(
  urlParams: ServiceUrlParams,
  limit: number = DEFAULT_LIMIT,
  locale?: string,
): Record<string, string | number> {
  const params: Record<string, string | number> = { limit };
  if (locale) params.locale = locale;

  const minPrice = aedToFils(urlParams.minPrice);
  if (minPrice !== undefined) params.min_price = minPrice;
  const maxPrice = aedToFils(urlParams.maxPrice);
  if (maxPrice !== undefined) params.max_price = maxPrice;

  if (urlParams.q) params.q = urlParams.q;
  if (urlParams.area) params.area = urlParams.area;
  if (urlParams.category) params.category = urlParams.category;
  if (urlParams.visit) params.visit = urlParams.visit;
  if (urlParams.paymentMode) params.payment_mode = urlParams.paymentMode;
  if (urlParams.sort) params.sort = urlParams.sort;

  const minDuration = num(urlParams.minDuration);
  if (minDuration !== undefined) params.min_duration = minDuration;
  const maxDuration = num(urlParams.maxDuration);
  if (maxDuration !== undefined) params.max_duration = maxDuration;
  const minRating = num(urlParams.minRating);
  // I3a: the route caps min_rating at 5 (t.Numeric({ minimum: 0, maximum: 5 })
  // in service.routes.ts) — an unclamped value like 9 would 422 instead of
  // degrading to the widest valid filter.
  if (minRating !== undefined) params.min_rating = Math.min(minRating, 5);
  const page = num(urlParams.page);
  // I3a: the route requires page >= 1 (t.Numeric({ minimum: 1 })) — page=0
  // would 422. 0 is not a legitimate page number (unlike minPrice/minDuration/
  // minRating, where 0 is meaningful), so clamp up to the first page instead
  // of preserving it.
  if (page !== undefined) params.page = Math.max(page, 1);

  return params;
}
