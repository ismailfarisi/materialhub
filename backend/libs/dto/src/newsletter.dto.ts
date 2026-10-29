import { type Static, Type } from "@sinclair/typebox";

// NOTE: t.Optional rejects null (see project_elysia_optional_rejects_null) —
// the frontend OMITS these fields rather than sending null.
export const NewsletterSubscribeBody = Type.Object({
  email: Type.String({ format: "email", maxLength: 320 }),
  locale: Type.Optional(Type.String({ maxLength: 10 })),
  source: Type.Optional(Type.String({ maxLength: 64 })),
});
export type NewsletterSubscribeBody = Static<typeof NewsletterSubscribeBody>;
