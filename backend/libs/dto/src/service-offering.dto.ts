import { type Static, Type } from "@sinclair/typebox";

const LocationMode = Type.Union([
  Type.Literal("at_premises"),
  Type.Literal("home_visit"),
  Type.Literal("either"),
]);
const PaymentMode = Type.Union([
  Type.Literal("prepay"),
  Type.Literal("deposit"),
  Type.Literal("pay_at_venue"),
]);
const DepositTypeSchema = Type.Union([
  Type.Literal("percent"),
  Type.Literal("fixed"),
  Type.Literal("none"),
]);
const RefundPolicy = Type.Union([
  Type.Literal("full"),
  Type.Literal("deposit_forfeit"),
  Type.Literal("percent"),
]);
// Vendors may set only these four. pending_review and rejected belong to the
// admin approval workflow (ServiceOfferingService.approve/reject) and must
// never be vendor-writable — this union is the wire boundary that enforces it.
const OfferingStatus = Type.Union([
  Type.Literal("draft"),
  Type.Literal("published"),
  Type.Literal("paused"),
  Type.Literal("archived"),
]);

// Every writable field is listed — Elysia strips unknown body props before the
// handler, so a missing field silently drops. Nullable fields use
// Type.Optional(Type.Union([X, Type.Null()])) because Type.Optional alone rejects null.
export const CreateServiceOfferingBody = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 255 }),
  category_id: Type.Optional(Type.Union([Type.String({ format: "uuid" }), Type.Null()])),
  description: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  media_urls: Type.Optional(Type.Array(Type.String())),
  duration_minutes: Type.Integer({ minimum: 1 }),
  buffer_before_minutes: Type.Optional(Type.Integer({ minimum: 0 })),
  buffer_after_minutes: Type.Optional(Type.Integer({ minimum: 0 })),
  slot_step_minutes: Type.Optional(Type.Integer({ minimum: 5 })),
  location_mode: Type.Optional(LocationMode),
  payment_mode: Type.Optional(PaymentMode),
  price_fils: Type.Integer({ minimum: 0 }),
  deposit_type: Type.Optional(DepositTypeSchema),
  deposit_value: Type.Optional(Type.Integer({ minimum: 0 })),
  vat_rate: Type.Optional(Type.Number({ minimum: 0, maximum: 100 })),
  min_notice_minutes: Type.Optional(Type.Integer({ minimum: 0 })),
  max_advance_days: Type.Optional(Type.Integer({ minimum: 1 })),
  cancellation_window_hours: Type.Optional(Type.Integer({ minimum: 0 })),
  cancellation_refund_policy: Type.Optional(RefundPolicy),
  cancellation_penalty_percent: Type.Optional(Type.Integer({ minimum: 0, maximum: 100 })),
  reschedule_window_hours: Type.Optional(Type.Integer({ minimum: 0 })),
  auto_approve: Type.Optional(Type.Boolean()),
});
export type CreateServiceOfferingBody = Static<typeof CreateServiceOfferingBody>;

export const UpdateServiceOfferingBody = Type.Partial(
  Type.Composite([CreateServiceOfferingBody, Type.Object({ status: OfferingStatus })]),
);
export type UpdateServiceOfferingBody = Static<typeof UpdateServiceOfferingBody>;

export const RejectServiceOfferingBody = Type.Object({
  reason: Type.String({ minLength: 1, maxLength: 2000 }),
});
export type RejectServiceOfferingBody = Static<typeof RejectServiceOfferingBody>;
