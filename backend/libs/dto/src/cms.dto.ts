import { type Static, Type } from "@sinclair/typebox";

// ─── Page DTOs ────────────────────────────────────────────────────────────────

export const CreatePageBody = Type.Object({
  title: Type.String({ minLength: 1, maxLength: 255 }),
  slug: Type.String({ minLength: 1, maxLength: 255, pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" }),
  content: Type.Optional(Type.String()),
  rich_content: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  status: Type.Optional(
    Type.Union([Type.Literal("draft"), Type.Literal("published"), Type.Literal("archived")]),
  ),
  locale: Type.Optional(Type.String({ maxLength: 10, default: "en" })),
  meta_title: Type.Optional(Type.String({ maxLength: 255 })),
  meta_description: Type.Optional(Type.String({ maxLength: 500 })),
  sort_order: Type.Optional(Type.Integer({ minimum: 0, default: 0 })),
});
export type CreatePageBody = Static<typeof CreatePageBody>;

export const UpdatePageBody = Type.Partial(CreatePageBody);
export type UpdatePageBody = Static<typeof UpdatePageBody>;

export const PageListQuery = Type.Object({
  page: Type.Optional(Type.Number({ minimum: 1, default: 1 })),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100, default: 20 })),
  status: Type.Optional(
    Type.Union([Type.Literal("draft"), Type.Literal("published"), Type.Literal("archived")]),
  ),
  locale: Type.Optional(Type.String({ maxLength: 10 })),
});
export type PageListQuery = Static<typeof PageListQuery>;

// ─── Banner DTOs ──────────────────────────────────────────────────────────────

export const CreateBannerBody = Type.Object({
  title: Type.String({ minLength: 1, maxLength: 255 }),
  subtitle: Type.Optional(Type.String({ maxLength: 500 })),
  image_url: Type.String({ maxLength: 1024 }),
  mobile_image_url: Type.Optional(Type.String({ maxLength: 1024 })),
  link_url: Type.Optional(Type.String({ maxLength: 1024 })),
  placement: Type.Union([
    Type.Literal("home_hero"),
    Type.Literal("home_secondary"),
    Type.Literal("category_top"),
    Type.Literal("sidebar"),
  ]),
  starts_at: Type.Optional(Type.String({ format: "date-time" })),
  expires_at: Type.Optional(Type.String({ format: "date-time" })),
  is_active: Type.Optional(Type.Boolean({ default: true })),
  sort_order: Type.Optional(Type.Integer({ minimum: 0, default: 0 })),
  locale: Type.Optional(Type.String({ maxLength: 10 })),
  target_audience: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
});
export type CreateBannerBody = Static<typeof CreateBannerBody>;

export const UpdateBannerBody = Type.Partial(CreateBannerBody);
export type UpdateBannerBody = Static<typeof UpdateBannerBody>;

export const BannerListQuery = Type.Object({
  page: Type.Optional(Type.Number({ minimum: 1, default: 1 })),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100, default: 20 })),
  placement: Type.Optional(Type.String()),
  is_active: Type.Optional(Type.Boolean()),
});
export type BannerListQuery = Static<typeof BannerListQuery>;

export const ActiveBannerQuery = Type.Object({
  placement: Type.String(),
  locale: Type.Optional(Type.String({ maxLength: 10 })),
});
export type ActiveBannerQuery = Static<typeof ActiveBannerQuery>;

// ─── Site Setting DTOs ────────────────────────────────────────────────────────

export const UpdateSiteSettingBody = Type.Object({
  value: Type.String(),
});
export type UpdateSiteSettingBody = Static<typeof UpdateSiteSettingBody>;

export const SiteSettingListQuery = Type.Object({
  group: Type.Optional(Type.String()),
});
export type SiteSettingListQuery = Static<typeof SiteSettingListQuery>;

// ─── Audit Log DTOs ───────────────────────────────────────────────────────────

export const AuditLogQuery = Type.Object({
  page: Type.Optional(Type.Number({ minimum: 1, default: 1 })),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100, default: 20 })),
  actor_id: Type.Optional(Type.String({ format: "uuid" })),
  action: Type.Optional(Type.String()),
  entity_type: Type.Optional(Type.String()),
  date_from: Type.Optional(Type.String({ format: "date-time" })),
  date_to: Type.Optional(Type.String({ format: "date-time" })),
});
export type AuditLogQuery = Static<typeof AuditLogQuery>;
