import { type Static, Type } from "@sinclair/typebox";

/**
 * A whole-number QUERY parameter.
 *
 * Query strings are strings: `?page=1` arrives as `"1"`. Elysia coerces that to
 * a number for `Type.Number`, but NOT for `Type.Integer` — an Integer schema
 * sees `"1"` and rejects it with "Expected integer". Every paginated query
 * schema in this repo uses `Type.Number` for exactly that reason; the three in
 * this file used `Type.Integer` and so rejected every request that carried a
 * `page` or `limit`, which is what took the admin payouts list down.
 *
 * `multipleOf: 1` keeps the integer intent that `Type.Integer` was there for —
 * a fractional `page` would otherwise reach the query builder and produce a
 * fractional SQL OFFSET.
 *
 * Body schemas must NOT use this: a JSON body carries real numbers, so
 * `Type.Integer` is both correct and stricter there (see
 * AdminPayoutDraftAdjustmentBody).
 */
const IntegerQueryParam = (opts: { minimum?: number; maximum?: number; default?: number } = {}) =>
  Type.Number({ multipleOf: 1, ...opts });

export const AdminPayoutListQuery = Type.Object({
  vendorId: Type.Optional(Type.String({ format: "uuid" })),
  status: Type.Optional(
    Type.Union([
      Type.Literal("pending"),
      Type.Literal("processing"),
      Type.Literal("paid"),
      Type.Literal("failed"),
    ]),
  ),
  periodFrom: Type.Optional(Type.String({ format: "date" })),
  periodTo: Type.Optional(Type.String({ format: "date" })),
  reference: Type.Optional(Type.String({ minLength: 1, maxLength: 50 })),
  minNet: Type.Optional(IntegerQueryParam({ minimum: 0 })),
  maxNet: Type.Optional(IntegerQueryParam({ minimum: 0 })),
  page: Type.Optional(IntegerQueryParam({ minimum: 1, default: 1 })),
  limit: Type.Optional(IntegerQueryParam({ minimum: 1, maximum: 100, default: 20 })),
});
export type AdminPayoutListQuery = Static<typeof AdminPayoutListQuery>;

export const AdminPayoutGenerateBody = Type.Object({
  vendorId: Type.String({ format: "uuid" }),
  periodStart: Type.String({ format: "date" }),
  periodEnd: Type.String({ format: "date" }),
  force: Type.Optional(Type.Boolean()),
});
export type AdminPayoutGenerateBody = Static<typeof AdminPayoutGenerateBody>;

export const AdminPayoutRejectBody = Type.Object({
  reason: Type.String({ minLength: 1, maxLength: 500 }),
});
export type AdminPayoutRejectBody = Static<typeof AdminPayoutRejectBody>;

/**
 * R4-C1 — POST /admin/payouts/:id/void. Same shape as the reject body (a
 * required, non-empty reason), separate symbol so the two operations can
 * diverge without one silently changing the other's contract.
 */
export const AdminPayoutVoidBody = Type.Object({
  reason: Type.String({ minLength: 1, maxLength: 500 }),
});
export type AdminPayoutVoidBody = Static<typeof AdminPayoutVoidBody>;

/**
 * POST /admin/payouts/:id/approve. `rail` is required and has no default —
 * how a vendor gets paid is an explicit per-payment decision, and defaulting
 * it would silently pick one.
 */
export const AdminPayoutApproveBody = Type.Object({
  rail: Type.Union([Type.Literal("manual_bank_transfer"), Type.Literal("stripe_connect")]),
});
export type AdminPayoutApproveBody = Static<typeof AdminPayoutApproveBody>;

export const AdminPayoutStatusBody = Type.Object({
  status: Type.Union([Type.Literal("paid"), Type.Literal("failed")]),
  notes: Type.Optional(Type.String({ maxLength: 2000 })),
  /** Bank transaction reference. Required when marking a manual-rail payout paid. */
  reference: Type.Optional(Type.String({ minLength: 1, maxLength: 255 })),
});
export type AdminPayoutStatusBody = Static<typeof AdminPayoutStatusBody>;

export const AdminPayoutNoteBody = Type.Object({
  note: Type.String({ minLength: 1, maxLength: 2000 }),
});
export type AdminPayoutNoteBody = Static<typeof AdminPayoutNoteBody>;

export const AdminPayoutEstimateQuery = Type.Object({
  vendorId: Type.String({ format: "uuid" }),
  // Optional so the existing all-time preview keeps working; when the caller
  // is about to generate a period-scoped draft it should pass the same
  // periodEnd, or the preview and the draft describe different money.
  periodEnd: Type.Optional(Type.String({ format: "date" })),
});
export type AdminPayoutEstimateQuery = Static<typeof AdminPayoutEstimateQuery>;

export const AdminPayoutCommissionsQuery = Type.Object({
  page: Type.Optional(IntegerQueryParam({ minimum: 1, default: 1 })),
  limit: Type.Optional(IntegerQueryParam({ minimum: 1, maximum: 100, default: 20 })),
});
export type AdminPayoutCommissionsQuery = Static<typeof AdminPayoutCommissionsQuery>;

export const AdminAdjustmentListQuery = Type.Object({
  vendorId: Type.String({ format: "uuid" }),
  page: Type.Optional(IntegerQueryParam({ minimum: 1, default: 1 })),
  limit: Type.Optional(IntegerQueryParam({ minimum: 1, maximum: 100, default: 20 })),
  unsettledOnly: Type.Optional(Type.Boolean()),
});
export type AdminAdjustmentListQuery = Static<typeof AdminAdjustmentListQuery>;

export const AdminAdjustmentCreateBody = Type.Object({
  vendorId: Type.String({ format: "uuid" }),
  amountFils: Type.Integer(),
  reason: Type.String({ minLength: 1, maxLength: 255 }),
});
export type AdminAdjustmentCreateBody = Static<typeof AdminAdjustmentCreateBody>;

/**
 * POST /admin/payouts/:id/adjustments — adjusts a pending draft in place.
 *
 * FIX 6 (final review): both `vendor_payouts.net_amount` and
 * `vendor_payout_adjustments.amount_fils` are Postgres int4. An unbounded
 * `Type.Integer()` passes `amountFils: 3e9` straight through DTO validation
 * (it IS a valid JS integer) and into `PayoutService.addDraftAdjustment`,
 * which dies as a raw Postgres int4-overflow 500 instead of a clean 400 on
 * operator input to a money endpoint. Bounded to the actual column range.
 */
export const AdminPayoutDraftAdjustmentBody = Type.Object({
  amountFils: Type.Integer({ minimum: -2147483648, maximum: 2147483647 }),
  reason: Type.String({ minLength: 1, maxLength: 255 }),
});
export type AdminPayoutDraftAdjustmentBody = Static<typeof AdminPayoutDraftAdjustmentBody>;
