import { type Static, Type } from "@sinclair/typebox";

export const SendNotificationBody = Type.Object({
  user_id: Type.String({ format: "uuid" }),
  type: Type.String(),
  channel: Type.Optional(Type.String({ default: "in_app" })),
  title: Type.String({ minLength: 1, maxLength: 255 }),
  body: Type.String({ minLength: 1 }),
  data: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  action_url: Type.Optional(Type.String({ maxLength: 1024 })),
});
export type SendNotificationBody = Static<typeof SendNotificationBody>;

export const NotificationListQuery = Type.Object({
  page: Type.Optional(Type.Number({ minimum: 1, default: 1 })),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100, default: 20 })),
  type: Type.Optional(Type.String()),
  is_read: Type.Optional(Type.Boolean()),
});
export type NotificationListQuery = Static<typeof NotificationListQuery>;
