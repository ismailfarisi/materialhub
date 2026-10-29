import { AppDataSource, GuestSession } from "@materialhub/database";
import { jwtAuth } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

const guestSessionRepo = AppDataSource.getRepository(GuestSession);

// Public resolve+click + optional-auth attribution capture. Gateway proxies
// the verbatim `/a` prefix here; this is a ROOT-level Elysia instance so the
// mount matches. jwtAuth is in-instance so POST /a/track (optional-auth) can
// read `user` (derived by jwtAuth) when a token is present — GET /a/:slug stays anonymous
// (isPublicRoute) and POST /a/track stays optional (isOptionalAuthRoute).
//
// NOTE: guest-session resolution is done INLINE in POST /a/track only (not via
// a shared .derive on this instance) — this instance also serves the hot
// GET /a/:slug click path, which must not gain a DB query.
export const affiliatePublicRoutes = new Elysia({ prefix: "/a" })
  .use(container)
  .use(jwtAuth)
  // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the service route pattern
  .get(
    "/:slug",
    async ({ params, affiliateResolveService, set }: any) => {
      const resolved = await affiliateResolveService.resolveAndClick(params.slug);
      if (!resolved) {
        set.status = 404;
        return {
          statusCode: 404,
          error: "affiliate_link_not_found",
          timestamp: new Date().toISOString(),
        };
      }
      set.status = 200;
      return { statusCode: 200, data: resolved, timestamp: new Date().toISOString() };
    },
    { params: t.Object({ slug: t.String({ maxLength: 50 }) }) },
  )
  // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the service route pattern
  .post(
    "/track",
    async ({ body, user, request, affiliateAttributionService, set }: any) => {
      const userId = (user as any)?.id ?? null;
      let sessionId: string | null = null;
      if (!userId) {
        const sessionToken = request.headers.get("x-guest-session") || null;
        if (sessionToken) {
          // Auth service stores SHA-256 hash of the session token
          const tokenHash = new Bun.CryptoHasher("sha256").update(sessionToken).digest("hex");
          const session = await guestSessionRepo.findOne({ where: { session_token: tokenHash } });
          if (session) sessionId = session.id;
        }
      }
      let attributed = false;
      try {
        const attribution = await affiliateAttributionService.recordClick({
          code: body.code,
          buyerUserId: userId,
          sessionId,
          productId: body.productId ?? null,
          affiliateLinkId: body.affiliateLinkId ?? null,
        });
        attributed = attribution !== null;
      } catch (err) {
        console.error("[affiliate] recordClick failed", {
          code: body.code,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      set.status = 200;
      return { statusCode: 200, data: { attributed }, timestamp: new Date().toISOString() };
    },
    {
      body: t.Object({
        code: t.String({ maxLength: 50 }),
        productId: t.Optional(t.Union([t.String({ format: "uuid" }), t.Null()])),
        affiliateLinkId: t.Optional(t.Union([t.String({ format: "uuid" }), t.Null()])),
      }),
    },
  );
