import { type Static, Type } from "@sinclair/typebox";

export const CreatorApplicationSocialLinks = Type.Object({
  instagram: Type.Optional(Type.Union([Type.String({ maxLength: 255 }), Type.Null()])),
  tiktok: Type.Optional(Type.Union([Type.String({ maxLength: 255 }), Type.Null()])),
  youtube: Type.Optional(Type.Union([Type.String({ maxLength: 255 }), Type.Null()])),
  other: Type.Optional(Type.Union([Type.String({ maxLength: 255 }), Type.Null()])),
});
export type CreatorApplicationSocialLinks = Static<typeof CreatorApplicationSocialLinks>;

// Elysia strips unknown body props — every applicant field must live here.
export const CreatorApplicationApplyBody = Type.Object({
  display_name: Type.String({ minLength: 2, maxLength: 120 }),
  bio: Type.String({ minLength: 1, maxLength: 2000 }),
  primary_category: Type.String({ minLength: 1, maxLength: 100 }),
  social_links: CreatorApplicationSocialLinks,
  follower_estimate: Type.Optional(Type.Union([Type.Integer({ minimum: 0 }), Type.Null()])),
  sample_urls: Type.Optional(
    Type.Union([Type.Array(Type.String({ maxLength: 500 }), { maxItems: 10 }), Type.Null()]),
  ),
  motivation: Type.Optional(Type.Union([Type.String({ maxLength: 2000 }), Type.Null()])),
  agreed_to_terms: Type.Boolean(),
});
export type CreatorApplicationApplyBody = Static<typeof CreatorApplicationApplyBody>;

export const CreatorProfileUpdateBody = Type.Object({
  display_name: Type.Optional(Type.String({ minLength: 2, maxLength: 120 })),
  bio: Type.Optional(Type.String({ minLength: 1, maxLength: 2000 })),
  social_links: Type.Optional(CreatorApplicationSocialLinks),
});
export type CreatorProfileUpdateBody = Static<typeof CreatorProfileUpdateBody>;

export const CreatorApplicationReviewBody = Type.Object({
  notes: Type.Optional(Type.Union([Type.String({ maxLength: 2000 }), Type.Null()])),
});
export type CreatorApplicationReviewBody = Static<typeof CreatorApplicationReviewBody>;

export const CreatorApplicationListQuery = Type.Object({
  status: Type.Optional(Type.String()),
  page: Type.Optional(Type.Number({ minimum: 1, default: 1 })),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100, default: 20 })),
});
export type CreatorApplicationListQuery = Static<typeof CreatorApplicationListQuery>;
