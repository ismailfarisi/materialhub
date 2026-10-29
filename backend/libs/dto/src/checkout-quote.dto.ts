import { type Static, Type } from "@sinclair/typebox";

// ── Unified envelope params (§2.6) ──
const MoneyParam = Type.Object({
  value: Type.Integer(),
  type: Type.Literal("money"),
  currency: Type.String({ minLength: 3, maxLength: 3 }),
});
const NumberParam = Type.Object({
  value: Type.Number(),
  type: Type.Literal("number"),
  plural: Type.Optional(Type.Boolean()),
});
const DateParam = Type.Object({ value: Type.String(), type: Type.Literal("date") });
const StringParam = Type.Object({ value: Type.String(), type: Type.Literal("string") });
const ReasonParam = Type.Union([MoneyParam, NumberParam, DateParam, StringParam]);

export const Envelope = Type.Object({
  code: Type.String(),
  severity: Type.Union([Type.Literal("info"), Type.Literal("warning"), Type.Literal("error")]),
  i18n_key: Type.String(),
  params: Type.Record(Type.String(), ReasonParam),
  affected_item_ids: Type.Union([Type.Array(Type.String()), Type.Null()]),
});

const ReasonKeyNullable = Type.Union([Type.String(), Type.Null()]);
const ReasonParamsNullable = Type.Union([Type.Record(Type.String(), ReasonParam), Type.Null()]);

// ── Payment methods (§2.2) ──
const BnplPlan = Type.Object({
  installments: Type.Integer(),
  interval_days: Type.Integer(),
});
const PaymentMethod = Type.Object({
  id: Type.String(),
  available: Type.Boolean(),
  surcharge_fils: Type.Integer(),
  surcharge_type: Type.Union([Type.Literal("fixed"), Type.Literal("percentage_bps")]),
  min_amount_fils: Type.Optional(Type.Integer()),
  max_amount_fils: Type.Optional(Type.Integer()),
  plans: Type.Optional(Type.Array(BnplPlan)),
  reason_key: ReasonKeyNullable,
  reason_params: Type.Optional(ReasonParamsNullable),
});

// ── Shipping (§2.2) ──
const ShippingMethod = Type.Object({
  id: Type.String(),
  available: Type.Boolean(),
  price_fils: Type.Integer(),
  estimated_days: Type.Object({ min: Type.Integer(), max: Type.Integer() }),
  free_threshold_fils: Type.Union([Type.Integer(), Type.Null()]),
  cutoff_at: Type.Union([Type.String(), Type.Null()]),
  next_available_at: Type.Union([Type.String(), Type.Null()]),
  reason_key: ReasonKeyNullable,
  reason_params: Type.Optional(ReasonParamsNullable),
  pickup_location_id: Type.Optional(Type.String({ format: "uuid" })),
});
const ShippingGroup = Type.Object({
  group_id: Type.String(),
  label_key: Type.Optional(Type.String()),
  label_params: Type.Optional(Type.Record(Type.String(), ReasonParam)),
  items: Type.Array(
    Type.Object({
      vendor_id: Type.String({ format: "uuid" }),
      item_ids: Type.Array(Type.String({ format: "uuid" })),
    }),
  ),
  methods: Type.Array(ShippingMethod),
  selected: Type.String(),
});

// ── Totals ──
const DefaultSelection = Type.Object({
  payment_method_id: Type.String(),
  shipping_by_group: Type.Record(Type.String(), Type.String()),
});
const Totals = Type.Object({
  subtotal_fils: Type.Integer(),
  vat_fils: Type.Integer(),
  vat_rate_bps: Type.Integer(),
  shipping_fils: Type.Optional(Type.Integer()),
  surcharge_fils: Type.Integer(),
  discount_fils: Type.Integer(),
  // Applied coupon (cart-persisted); lets the client render/remove it after a
  // reload even though its own state is gone.
  coupon_code: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  grand_total_fils: Type.Integer(),
  default_selection: DefaultSelection,
});

// ── Top-level response ──
export const CheckoutQuoteResponse = Type.Object({
  schema_version: Type.Literal(1),
  quote_token: Type.String(),
  issued_at: Type.String(),
  expires_at: Type.String(),
  currency: Type.String(),
  requires_address: Type.Boolean(),
  fx_snapshot: Type.Object({
    base: Type.String(),
    rate: Type.Number(),
    captured_at: Type.String(),
  }),
  totals: Totals,
  payment_methods: Type.Array(PaymentMethod),
  shipping: Type.Union([Type.Null(), Type.Object({ groups: Type.Array(ShippingGroup) })]),
  compatibility: Type.Record(Type.String(), Type.Array(Type.String())),
  notices: Type.Array(Envelope),
  blocking_error: Type.Optional(Envelope),
});
export type CheckoutQuoteResponse = Static<typeof CheckoutQuoteResponse>;

export const PaymentInstrumentsResponse = Type.Object({
  schema_version: Type.Literal(1),
  instruments: Type.Array(
    Type.Object({
      id: Type.String(),
      type: Type.Literal("card"),
      brand: Type.String(),
      last4: Type.String({ minLength: 4, maxLength: 4 }),
      exp_month: Type.Integer({ minimum: 1, maximum: 12 }),
      exp_year: Type.Integer(),
      is_expired: Type.Boolean(),
      is_default: Type.Boolean(),
      requires_3ds: Type.Boolean(),
      network_token_available: Type.Boolean(),
      funding: Type.Union([
        Type.Literal("credit"),
        Type.Literal("debit"),
        Type.Literal("prepaid"),
        Type.Literal("unknown"),
      ]),
    }),
  ),
});
export type PaymentInstrumentsResponse = Static<typeof PaymentInstrumentsResponse>;

// NOTE: `InitiateCheckoutBody` is already exported from `order.dto.ts` (legacy
// checkout flow). To avoid a re-export collision in the package index, the
// dynamic-options variant is exported under a V2 name until the legacy schema
// is retired (see plan task #10: "Add quote_token validation to
// /checkout/initiate").
export const InitiateCheckoutV2Body = Type.Object({
  quote_token: Type.Optional(Type.String()),
});
export type InitiateCheckoutV2Body = Static<typeof InitiateCheckoutV2Body>;
