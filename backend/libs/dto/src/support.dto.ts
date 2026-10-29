import { type Static, Type } from "@sinclair/typebox";

// ─── Ticket DTOs ──────────────────────────────────────────────────────────────

export const CreateTicketBody = Type.Object({
  subject: Type.String({ minLength: 1, maxLength: 255 }),
  category: Type.Union([
    Type.Literal("order"),
    Type.Literal("payment"),
    Type.Literal("product"),
    Type.Literal("account"),
    Type.Null(),
  ]),
  order_id: Type.Optional(Type.Union([Type.String({ format: "uuid" }), Type.Null()])),
  message: Type.String({ minLength: 1 }),
  guest_email: Type.Optional(Type.String({ format: "email", maxLength: 255 })),
  guest_name: Type.Optional(Type.String({ minLength: 1, maxLength: 255 })),
});
export type CreateTicketBody = Static<typeof CreateTicketBody>;

export const UpdateTicketBody = Type.Object({
  status: Type.Optional(
    Type.Union([
      Type.Literal("open"),
      Type.Literal("in_progress"),
      Type.Literal("waiting_customer"),
      Type.Literal("resolved"),
      Type.Literal("closed"),
    ]),
  ),
  priority: Type.Optional(
    Type.Union([
      Type.Literal("low"),
      Type.Literal("medium"),
      Type.Literal("high"),
      Type.Literal("urgent"),
    ]),
  ),
  assigned_to: Type.Optional(Type.Union([Type.String({ format: "uuid" }), Type.Null()])),
});
export type UpdateTicketBody = Static<typeof UpdateTicketBody>;

export const CreateMessageBody = Type.Object({
  message: Type.String({ minLength: 1 }),
  attachment_urls: Type.Optional(Type.Array(Type.String())),
  is_internal: Type.Optional(Type.Boolean({ default: false })),
});
export type CreateMessageBody = Static<typeof CreateMessageBody>;

export const TicketListQuery = Type.Object({
  page: Type.Optional(Type.Number({ minimum: 1, default: 1 })),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100, default: 20 })),
  status: Type.Optional(
    Type.Union([
      Type.Literal("open"),
      Type.Literal("in_progress"),
      Type.Literal("waiting_customer"),
      Type.Literal("resolved"),
      Type.Literal("closed"),
    ]),
  ),
  priority: Type.Optional(
    Type.Union([
      Type.Literal("low"),
      Type.Literal("medium"),
      Type.Literal("high"),
      Type.Literal("urgent"),
    ]),
  ),
  assigned_to: Type.Optional(Type.String({ format: "uuid" })),
  date_from: Type.Optional(Type.String({ format: "date-time" })),
  date_to: Type.Optional(Type.String({ format: "date-time" })),
});
export type TicketListQuery = Static<typeof TicketListQuery>;
