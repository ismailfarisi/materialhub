import { jwtAuth, vendorMembership } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

const PREFIX = "/vendor/affiliates";

// Reads — payouts.read (owner/manager/viewer may inspect affiliate program state).
const vendorAffiliatesReadRoutes = new Elysia({ prefix: PREFIX })
  .use(container)
  .use(jwtAuth)
  .use(vendorMembership("payouts.read"))
  // biome-ignore lint/suspicious/noExplicitAny: handler context follows the vendor route pattern
  .get("/", async ({ member, vendorAffiliateService }: any) => {
    const items = await vendorAffiliateService.listForVendor(member.vid);
    return { statusCode: 200, data: items, timestamp: new Date().toISOString() };
  })
  // biome-ignore lint/suspicious/noExplicitAny: handler context follows the vendor route pattern
  .get("/:id", async ({ params, member, vendorAffiliateService, set }: any) => {
    const aff = await vendorAffiliateService.getForVendor(member.vid, params.id);
    if (!aff) {
      set.status = 404;
      return { statusCode: 404, data: null, timestamp: new Date().toISOString() };
    }
    const links = await vendorAffiliateService.listLinks(aff.id);
    return {
      statusCode: 200,
      data: { affiliate: aff, links },
      timestamp: new Date().toISOString(),
    };
  });

// Mutations — bank.read (owner/manager only; commits vendor funds, like licensing).
const vendorAffiliatesWriteRoutes = new Elysia({ prefix: PREFIX })
  .use(container)
  .use(jwtAuth)
  .use(vendorMembership("bank.read"))
  .post(
    "/",
    // biome-ignore lint/suspicious/noExplicitAny: handler context follows the vendor route pattern
    async ({ body, member, user, vendorAffiliateService }: any) => {
      const aff = await vendorAffiliateService.invite(
        member.vid,
        {
          email: body.email,
          userId: body.userId,
          commissionType: body.commissionType,
          commissionValue: body.commissionValue,
        },
        user.id,
      );
      return { statusCode: 201, data: aff, timestamp: new Date().toISOString() };
    },
    {
      body: t.Object({
        email: t.Optional(t.Union([t.String({ format: "email" }), t.Null()])),
        userId: t.Optional(t.Union([t.String({ format: "uuid" }), t.Null()])),
        commissionType: t.Union([t.Literal("percentage"), t.Literal("fixed")]),
        commissionValue: t.Integer({ minimum: 0 }),
      }),
    },
  )
  .patch(
    "/:id/rate",
    // biome-ignore lint/suspicious/noExplicitAny: handler context follows the vendor route pattern
    async ({ params, body, member, vendorAffiliateService }: any) => {
      const aff = await vendorAffiliateService.setRate(member.vid, params.id, body);
      return { statusCode: 200, data: aff, timestamp: new Date().toISOString() };
    },
    {
      body: t.Object({
        commissionType: t.Union([t.Literal("percentage"), t.Literal("fixed")]),
        commissionValue: t.Integer({ minimum: 0 }),
      }),
    },
  )
  .patch(
    "/:id/status",
    // biome-ignore lint/suspicious/noExplicitAny: handler context follows the vendor route pattern
    async ({ params, body, member, vendorAffiliateService }: any) => {
      const aff = await vendorAffiliateService.setStatus(member.vid, params.id, body.status);
      return { statusCode: 200, data: aff, timestamp: new Date().toISOString() };
    },
    {
      body: t.Object({
        status: t.Union([t.Literal("active"), t.Literal("suspended"), t.Literal("revoked")]),
      }),
    },
  )
  .post(
    "/:id/links",
    // biome-ignore lint/suspicious/noExplicitAny: handler context follows the vendor route pattern
    async ({ params, body, member, vendorAffiliateService }: any) => {
      const link = await vendorAffiliateService.createLink(member.vid, params.id, {
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
  );

export const vendorAffiliatesRoutes = new Elysia()
  .use(vendorAffiliatesReadRoutes)
  .use(vendorAffiliatesWriteRoutes);
