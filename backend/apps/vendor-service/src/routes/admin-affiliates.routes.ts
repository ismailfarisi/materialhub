import { jwtAuth, requireRole } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

export const adminAffiliatesRoutes = new Elysia({ prefix: "/admin/affiliates" })
  .use(container)
  .use(jwtAuth)
  .use(requireRole("admin", "super_admin"))
  .get(
    "/",
    // biome-ignore lint/suspicious/noExplicitAny: handler context follows the admin route pattern
    async ({ query, vendorAffiliateService }: any) => {
      const res = await vendorAffiliateService.listAllForAdmin({
        vendorId: query.vendorId,
        page: query.page ? Number(query.page) : undefined,
        limit: query.limit ? Number(query.limit) : undefined,
      });
      return {
        statusCode: 200,
        data: res.data,
        meta: { total: res.total },
        timestamp: new Date().toISOString(),
      };
    },
    {
      query: t.Object({
        vendorId: t.Optional(t.String()),
        page: t.Optional(t.String()),
        limit: t.Optional(t.String()),
      }),
    },
  )
  .post(
    "/",
    // biome-ignore lint/suspicious/noExplicitAny: handler context follows the admin route pattern
    async ({ body, user, vendorAffiliateService }: any) => {
      const aff = await vendorAffiliateService.invite(
        body.vendorId,
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
        vendorId: t.String({ format: "uuid" }),
        email: t.Optional(t.Union([t.String({ format: "email" }), t.Null()])),
        userId: t.Optional(t.Union([t.String({ format: "uuid" }), t.Null()])),
        commissionType: t.Union([t.Literal("percentage"), t.Literal("fixed")]),
        commissionValue: t.Integer({ minimum: 0 }),
      }),
    },
  )
  .get(
    "/:id",
    // biome-ignore lint/suspicious/noExplicitAny: handler context follows the admin route pattern
    async ({ params, vendorAffiliateService, set }: any) => {
      const aff = await vendorAffiliateService.getById(params.id);
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
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )
  .patch(
    "/:id/rate",
    // biome-ignore lint/suspicious/noExplicitAny: handler context follows the admin route pattern
    async ({ params, body, vendorAffiliateService }: any) => {
      const aff = await vendorAffiliateService.setRateByAdmin(params.id, body);
      return { statusCode: 200, data: aff, timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({
        commissionType: t.Union([t.Literal("percentage"), t.Literal("fixed")]),
        commissionValue: t.Integer({ minimum: 0 }),
      }),
    },
  )
  .patch(
    "/:id/status",
    // biome-ignore lint/suspicious/noExplicitAny: handler context follows the admin route pattern
    async ({ params, body, vendorAffiliateService }: any) => {
      const aff = await vendorAffiliateService.setStatusByAdmin(params.id, body.status);
      return { statusCode: 200, data: aff, timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({
        status: t.Union([t.Literal("active"), t.Literal("suspended"), t.Literal("revoked")]),
      }),
    },
  )
  .get(
    "/:id/links",
    // biome-ignore lint/suspicious/noExplicitAny: handler context follows the admin route pattern
    async ({ params, vendorAffiliateService }: any) => {
      const links = await vendorAffiliateService.listLinks(params.id);
      return { statusCode: 200, data: links, timestamp: new Date().toISOString() };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )
  .post(
    "/:id/links",
    // biome-ignore lint/suspicious/noExplicitAny: handler context follows the admin route pattern
    async ({ params, body, vendorAffiliateService }: any) => {
      const link = await vendorAffiliateService.createLinkByAdmin(params.id, {
        targetType: body.targetType,
        targetId: body.targetId ?? null,
        targetUrl: body.targetUrl ?? null,
      });
      return { statusCode: 201, data: link, timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
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
  .get(
    "/:id/commissions",
    // biome-ignore lint/suspicious/noExplicitAny: handler context follows the admin route pattern
    async ({ params, vendorAffiliateService }: any) => {
      const rows = await vendorAffiliateService.listCommissionsForAffiliate(params.id);
      return { statusCode: 200, data: rows, timestamp: new Date().toISOString() };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  );
