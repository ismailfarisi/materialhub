import { t } from "elysia";

/**
 * Query schema for GET /vendors/me/payouts — the vendor dashboard's payouts
 * page.
 *
 * Lives in its own module rather than inline in commission.routes.ts so its
 * test can probe the real schema through a live Elysia route; importing the
 * routes module pulls in the DI container, which opens Postgres and Redis
 * connections that CI doesn't have.
 *
 * `status` mirrors the PayoutStatus enum and the admin-side
 * AdminPayoutListQuery. Declaring it is the whole point: Elysia silently DROPS
 * query params a schema doesn't list, so the page's Status dropdown was
 * sending a value that never reached the handler and every selection returned
 * the full unfiltered list.
 *
 * Uses elysia's `t`, not `Type` from @sinclair/typebox: elysia's variant
 * registers the coercion transforms that turn `?page=1` into a number, which
 * is why `t.Integer` is safe here while the raw `Type.Integer` used by
 * libs/dto is not (see IntegerQueryParam in admin-payout.dto.ts, PR #376).
 */
export const VendorPayoutListQuery = t.Object({
  status: t.Optional(
    t.Union([
      t.Literal("pending"),
      t.Literal("processing"),
      t.Literal("paid"),
      t.Literal("failed"),
    ]),
  ),
  page: t.Optional(t.Integer({ default: 1 })),
  limit: t.Optional(t.Integer({ default: 20 })),
});
