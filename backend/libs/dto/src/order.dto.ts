import { type Static, Type } from "@sinclair/typebox";

const AddressSchema = Type.Object({
  first_name: Type.String({ maxLength: 100 }),
  last_name: Type.String({ maxLength: 100 }),
  phone: Type.String({ maxLength: 20 }),
  address_line_1: Type.String({ maxLength: 255 }),
  address_line_2: Type.Optional(Type.String({ maxLength: 255 })),
  building_name: Type.Optional(Type.String({ maxLength: 150 })),
  apartment: Type.Optional(Type.String({ maxLength: 50 })),
  floor: Type.Optional(Type.String({ maxLength: 50 })),
  city: Type.String({ maxLength: 100 }),
  state: Type.Optional(Type.String({ maxLength: 100 })),
  postal_code: Type.Optional(Type.String({ maxLength: 20 })),
  country_code: Type.String({ minLength: 2, maxLength: 2 }),
});

export const InitiateCheckoutBody = Type.Object({
  cart_id: Type.String({ format: "uuid" }),
  shipping_address: AddressSchema,
  billing_address: Type.Optional(AddressSchema),
  shipping_method: Type.Optional(Type.String()),
  customer_notes: Type.Optional(Type.String({ maxLength: 1000 })),
});
export type InitiateCheckoutBody = Static<typeof InitiateCheckoutBody>;

export const ApplyCouponBody = Type.Object({
  order_id: Type.String({ format: "uuid" }),
  coupon_code: Type.String({ minLength: 1, maxLength: 50 }),
});
export type ApplyCouponBody = Static<typeof ApplyCouponBody>;

export const CreatePaymentIntentBody = Type.Object({
  order_id: Type.String({ format: "uuid" }),
  payment_method: Type.String(),
  return_url: Type.Optional(Type.String()),
});
export type CreatePaymentIntentBody = Static<typeof CreatePaymentIntentBody>;

export const OrderListQuery = Type.Object({
  page: Type.Optional(Type.Number({ minimum: 1, default: 1 })),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100, default: 20 })),
  status: Type.Optional(Type.String()),
  sort_by: Type.Optional(Type.String({ default: "created_at" })),
  sort_order: Type.Optional(Type.Union([Type.Literal("asc"), Type.Literal("desc")])),
});
export type OrderListQuery = Static<typeof OrderListQuery>;

// ── Cart DTOs (S4-02) ────────────────────────────────────────────────────────

export const AddCartItemBody = Type.Object({
  productId: Type.String({ format: "uuid" }),
  variantId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
  quantity: Type.Integer({ minimum: 1, maximum: 100 }),
});
export type AddCartItemBody = Static<typeof AddCartItemBody>;

export const UpdateCartItemBody = Type.Object({
  quantity: Type.Integer({ minimum: 0, maximum: 100 }),
});
export type UpdateCartItemBody = Static<typeof UpdateCartItemBody>;

export const MergeCartBody = Type.Object({
  guestSessionId: Type.String({ minLength: 1 }),
});
export type MergeCartBody = Static<typeof MergeCartBody>;

export const CartItemResponse = Type.Object({
  id: Type.String({ format: "uuid" }),
  product_id: Type.String({ format: "uuid" }),
  variant_id: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
  quantity: Type.Integer(),
  unit_price: Type.Number(),
  line_total: Type.Number(),
  vendor_id: Type.String({ format: "uuid" }),
});
export type CartItemResponse = Static<typeof CartItemResponse>;

export const CartResponse = Type.Object({
  id: Type.String({ format: "uuid" }),
  user_id: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
  guest_session_id: Type.Union([Type.String(), Type.Null()]),
  subtotal: Type.Number(),
  item_count: Type.Integer(),
  items: Type.Array(CartItemResponse),
  expires_at: Type.String(),
});
export type CartResponse = Static<typeof CartResponse>;

// ── Shipping DTOs (S4-05) ────────────────────────────────────────────────────

export const DeliveryZoneLookupQuery = Type.Object({
  lat: Type.Number({ minimum: -90, maximum: 90 }),
  lng: Type.Number({ minimum: -180, maximum: 180 }),
});
export type DeliveryZoneLookupQuery = Static<typeof DeliveryZoneLookupQuery>;

export const CreateDeliveryZoneBody = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 100 }),
  city: Type.Optional(Type.String({ maxLength: 100 })),
  emirate: Type.Optional(Type.String({ maxLength: 100 })),
  boundary: Type.Optional(Type.Any()),
  is_active: Type.Optional(Type.Boolean({ default: true })),
});
export type CreateDeliveryZoneBody = Static<typeof CreateDeliveryZoneBody>;

export const ShippingRateQuery = Type.Object({
  zoneId: Type.String({ format: "uuid" }),
  vendorId: Type.Optional(Type.String({ format: "uuid" })),
  weight: Type.Optional(Type.Number({ minimum: 0 })),
  orderTotal: Type.Optional(Type.Number({ minimum: 0 })),
});
export type ShippingRateQuery = Static<typeof ShippingRateQuery>;

// ── Order Lifecycle DTOs (S5-01) ────────────────────────────────────────────

export const TransitionStatusBody = Type.Object({
  status: Type.String({ minLength: 1 }),
});
export type TransitionStatusBody = Static<typeof TransitionStatusBody>;

export const CancelOrderBody = Type.Object({
  reason: Type.String({ minLength: 1, maxLength: 1000 }),
});
export type CancelOrderBody = Static<typeof CancelOrderBody>;

export const RejectOrderBody = Type.Object({
  reason: Type.String({ minLength: 1, maxLength: 1000 }),
});
export type RejectOrderBody = Static<typeof RejectOrderBody>;

export const VendorOrderListQuery = Type.Object({
  page: Type.Optional(Type.Number({ minimum: 1, default: 1 })),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100, default: 20 })),
  status: Type.Optional(Type.String()),
  from_date: Type.Optional(Type.String({ format: "date" })),
  to_date: Type.Optional(Type.String({ format: "date" })),
});
export type VendorOrderListQuery = Static<typeof VendorOrderListQuery>;

export const AdminOrderListQuery = Type.Object({
  page: Type.Optional(Type.Number({ minimum: 1, default: 1 })),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100, default: 20 })),
  status: Type.Optional(Type.String()),
  vendor_id: Type.Optional(Type.String({ format: "uuid" })),
  user_id: Type.Optional(Type.String({ format: "uuid" })),
  from_date: Type.Optional(Type.String({ format: "date" })),
  to_date: Type.Optional(Type.String({ format: "date" })),
});
export type AdminOrderListQuery = Static<typeof AdminOrderListQuery>;

// ── Shipment DTOs (S5-02) ───────────────────────────────────────────────────

export const CreateShipmentItemBody = Type.Object({
  order_item_id: Type.String({ format: "uuid" }),
  quantity: Type.Integer({ minimum: 1 }),
});
export type CreateShipmentItemBody = Static<typeof CreateShipmentItemBody>;

export const CreateShipmentBody = Type.Object({
  tracking_number: Type.String({ minLength: 1, maxLength: 100 }),
  carrier: Type.String({ minLength: 1, maxLength: 100 }),
  carrier_service: Type.Optional(Type.String({ maxLength: 100 })),
  tracking_url: Type.Optional(Type.String({ maxLength: 1024 })),
  warehouse_id: Type.Optional(Type.String({ format: "uuid" })),
  weight_grams: Type.Optional(Type.Integer({ minimum: 0 })),
  shipping_cost: Type.Optional(Type.Integer({ minimum: 0 })),
  estimated_delivery_at: Type.Optional(Type.String({ format: "date-time" })),
  items: Type.Array(CreateShipmentItemBody, { minItems: 1 }),
});
export type CreateShipmentBody = Static<typeof CreateShipmentBody>;

export const CarrierWebhookBody = Type.Object({
  tracking_number: Type.String({ minLength: 1 }),
  status: Type.String({ minLength: 1 }),
  location: Type.Optional(Type.String()),
  description: Type.Optional(Type.String()),
  occurred_at: Type.String(),
  raw_payload: Type.Optional(Type.Any()),
});
export type CarrierWebhookBody = Static<typeof CarrierWebhookBody>;

// ── Return DTOs (S5-03) ─────────────────────────────────────────────────────

const ReturnReasonEnum = Type.Union([
  Type.Literal("defective"),
  Type.Literal("wrong_item"),
  Type.Literal("not_as_described"),
  Type.Literal("changed_mind"),
  Type.Literal("arrived_late"),
  Type.Literal("other"),
]);

export const CreateReturnItemBody = Type.Object({
  order_item_id: Type.String({ format: "uuid" }),
  quantity: Type.Integer({ minimum: 1 }),
  reason: ReturnReasonEnum,
  condition: Type.Optional(
    Type.Union([Type.Literal("unopened"), Type.Literal("damaged"), Type.Literal("used")]),
  ),
});
export type CreateReturnItemBody = Static<typeof CreateReturnItemBody>;

export const CreateReturnBody = Type.Object({
  vendor_order_id: Type.String({ format: "uuid" }),
  reason: ReturnReasonEnum,
  reason_details: Type.Optional(Type.String({ maxLength: 2000 })),
  media_urls: Type.Optional(Type.Array(Type.String(), { maxItems: 10 })),
  items: Type.Array(CreateReturnItemBody, { minItems: 1 }),
});
export type CreateReturnBody = Static<typeof CreateReturnBody>;

export const ApproveReturnBody = Type.Object({
  refund_amount: Type.Integer({ minimum: 0 }),
  refund_method: Type.Union([
    Type.Literal("wallet"),
    Type.Literal("original_payment"),
    Type.Literal("manual"),
  ]),
  item_refunds: Type.Optional(
    Type.Array(
      Type.Object({
        return_item_id: Type.String({ format: "uuid" }),
        refund_amount: Type.Integer({ minimum: 0 }),
      }),
    ),
  ),
  admin_notes: Type.Optional(Type.String({ maxLength: 2000 })),
});
export type ApproveReturnBody = Static<typeof ApproveReturnBody>;

export const RejectReturnBody = Type.Object({
  rejection_reason: Type.String({ minLength: 1, maxLength: 1000 }),
});
export type RejectReturnBody = Static<typeof RejectReturnBody>;

export const ReturnShippingBody = Type.Object({
  carrier: Type.String({ minLength: 1, maxLength: 100 }),
  tracking_number: Type.String({ minLength: 1, maxLength: 100 }),
  shipping_cost: Type.Optional(Type.Integer({ minimum: 0 })),
  paid_by: Type.Optional(
    Type.Union([Type.Literal("buyer"), Type.Literal("vendor"), Type.Literal("platform")]),
  ),
});
export type ReturnShippingBody = Static<typeof ReturnShippingBody>;

export const MarkReceivedBody = Type.Object({
  restock: Type.Optional(Type.Boolean({ default: false })),
});
export type MarkReceivedBody = Static<typeof MarkReceivedBody>;

// ── Dispute DTOs (S5-03) ────────────────────────────────────────────────────

const DisputeCategories = Type.Union([
  Type.Literal("item_not_received"),
  Type.Literal("not_as_described"),
  Type.Literal("counterfeit"),
  Type.Literal("seller_unresponsive"),
  Type.Literal("other"),
]);

export const OpenDisputeBody = Type.Object({
  vendor_order_id: Type.Optional(Type.String({ format: "uuid" })),
  category: DisputeCategories,
  description: Type.String({ minLength: 1, maxLength: 5000 }),
  evidence_urls: Type.Optional(Type.Array(Type.String(), { maxItems: 10 })),
});
export type OpenDisputeBody = Static<typeof OpenDisputeBody>;

export const AssignDisputeBody = Type.Object({
  assignee_id: Type.String({ format: "uuid" }),
});
export type AssignDisputeBody = Static<typeof AssignDisputeBody>;

export const ResolveDisputeBody = Type.Object({
  decision: Type.Union([Type.Literal("buyer"), Type.Literal("seller")]),
  resolution: Type.String({ minLength: 1, maxLength: 5000 }),
  resolution_amount: Type.Optional(Type.Integer({ minimum: 0 })),
});
export type ResolveDisputeBody = Static<typeof ResolveDisputeBody>;

export const DisputeMessageBody = Type.Object({
  message: Type.String({ minLength: 1, maxLength: 5000 }),
  attachment_urls: Type.Optional(Type.Array(Type.String(), { maxItems: 5 })),
  is_internal: Type.Optional(Type.Boolean({ default: false })),
});
export type DisputeMessageBody = Static<typeof DisputeMessageBody>;

// ── Review DTOs (S5-04) ─────────────────────────────────────────────────────

export const CreateReviewBody = Type.Object({
  order_item_id: Type.String({ format: "uuid" }),
  rating: Type.Integer({ minimum: 1, maximum: 5 }),
  title: Type.Optional(Type.String({ maxLength: 255 })),
  body: Type.Optional(Type.String({ maxLength: 5000 })),
  media_urls: Type.Optional(Type.Array(Type.String(), { maxItems: 5 })),
  quality_rating: Type.Optional(Type.Integer({ minimum: 1, maximum: 5 })),
  value_rating: Type.Optional(Type.Integer({ minimum: 1, maximum: 5 })),
  shipping_rating: Type.Optional(Type.Integer({ minimum: 1, maximum: 5 })),
});
export type CreateReviewBody = Static<typeof CreateReviewBody>;

export const VendorReplyBody = Type.Object({
  reply: Type.String({ minLength: 1, maxLength: 5000 }),
});
export type VendorReplyBody = Static<typeof VendorReplyBody>;

export const ReviewVoteBody = Type.Object({
  is_helpful: Type.Boolean(),
});
export type ReviewVoteBody = Static<typeof ReviewVoteBody>;

export const RejectReviewBody = Type.Object({
  rejection_reason: Type.String({ minLength: 1, maxLength: 1000 }),
});
export type RejectReviewBody = Static<typeof RejectReviewBody>;

export const ProductReviewsQuery = Type.Object({
  page: Type.Optional(Type.Number({ minimum: 1, default: 1 })),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100, default: 20 })),
  sort: Type.Optional(
    Type.Union([
      Type.Literal("newest"),
      Type.Literal("highest"),
      Type.Literal("lowest"),
      Type.Literal("most_helpful"),
    ]),
  ),
  rating: Type.Optional(Type.Integer({ minimum: 1, maximum: 5 })),
});
export type ProductReviewsQuery = Static<typeof ProductReviewsQuery>;
