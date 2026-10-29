import { jwtAuth } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

export const meAffiliateRoutes = new Elysia({ prefix: "/me/affiliate" })
  .use(container)
  .use(jwtAuth)
  // biome-ignore lint/suspicious/noExplicitAny: handler context follows the /me route pattern
  .get("/affiliations", async ({ user, affiliateMeService }: any) => {
    const items = await affiliateMeService.listAffiliations(user.id);
    return { statusCode: 200, data: items, timestamp: new Date().toISOString() };
  })
  // biome-ignore lint/suspicious/noExplicitAny: handler context follows the /me route pattern
  .get("/earnings", async ({ user, affiliateMeService }: any) => {
    const summary = await affiliateMeService.earningsSummary(user.id);
    return { statusCode: 200, data: summary, timestamp: new Date().toISOString() };
  })
  // biome-ignore lint/suspicious/noExplicitAny: handler context follows the /me route pattern
  .post("/affiliations/:id/accept", async ({ params, user, vendorAffiliateService }: any) => {
    const aff = await vendorAffiliateService.accept(user.id, params.id);
    return { statusCode: 200, data: aff, timestamp: new Date().toISOString() };
  })
  .get(
    "/affiliations/:id/links",
    // biome-ignore lint/suspicious/noExplicitAny: handler context follows the /me route pattern
    async ({ params, user, affiliateMeService, vendorAffiliateService }: any) => {
      await affiliateMeService.assertOwnsAffiliate(user.id, params.id);
      const links = await vendorAffiliateService.listLinks(params.id);
      return { statusCode: 200, data: links, timestamp: new Date().toISOString() };
    },
  )
  .post(
    "/affiliations/:id/links",
    // biome-ignore lint/suspicious/noExplicitAny: handler context follows the /me route pattern
    async ({ params, body, user, affiliateMeService, vendorAffiliateService }: any) => {
      const aff = await affiliateMeService.assertOwnsAffiliate(user.id, params.id);
      const link = await vendorAffiliateService.createLink(aff.vendor_id, params.id, {
        targetType: body.targetType,
        targetId: body.targetId ?? null,
        targetUrl: body.targetUrl ?? null,
      });
      return { statusCode: 201, data: link, timestamp: new Date().toISOString() };
    },
    {
      body: t.Object({
        targetType: t.Union([
          t.Literal("store"),
          t.Literal("product"),
          t.Literal("brand"),
          t.Literal("custom_url"),
        ]),
        targetId: t.Optional(t.Union([t.String({ format: "uuid" }), t.Null()])),
        targetUrl: t.Optional(t.Union([t.String({ maxLength: 500 }), t.Null()])),
      }),
    },
  )
  // biome-ignore lint/suspicious/noExplicitAny: handler context follows the /me route pattern
  .post("/payout", async ({ user, affiliatePayoutService, set }: any) => {
    try {
      const res = await affiliatePayoutService.requestPayout(user.id);
      return { statusCode: 200, data: res, timestamp: new Date().toISOString() };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.startsWith("payout_below_threshold")) {
        set.status = 400;
        return {
          statusCode: 400,
          error: "payout_below_threshold",
          timestamp: new Date().toISOString(),
        };
      }
      throw err;
    }
  });
