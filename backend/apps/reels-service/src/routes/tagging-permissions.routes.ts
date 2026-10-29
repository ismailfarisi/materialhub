import { jwtAuth, requireRole } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

export const taggingPermissionsRoutes = new Elysia({ prefix: "/admin/reels/tagging-permissions" })
  .use(container)
  .use(jwtAuth)
  .use(requireRole("admin", "super_admin"))
  .get("/", async ({ taggingPermissionsService }: any) => {
    const items = await taggingPermissionsService.list();
    return { statusCode: 200, items, timestamp: new Date().toISOString() };
  })
  .post(
    "/",
    async ({ body, user, taggingPermissionsService }: any) => {
      const perm = await taggingPermissionsService.grant({
        userId: body.userId,
        scope: body.scope,
        brandId: body.brandId,
        vendorId: body.vendorId,
        productIds: body.productIds,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
        reason: body.reason,
        grantedBy: user!.id,
      });
      return { statusCode: 201, data: perm, timestamp: new Date().toISOString() };
    },
    {
      body: t.Object({
        userId: t.String({ format: "uuid" }),
        scope: t.Union([
          t.Literal("any_product"),
          t.Literal("specific_brand"),
          t.Literal("specific_vendor"),
          t.Literal("specific_products"),
        ]),
        brandId: t.Optional(t.String({ format: "uuid" })),
        vendorId: t.Optional(t.String({ format: "uuid" })),
        productIds: t.Optional(t.Array(t.String({ format: "uuid" }))),
        expiresAt: t.Optional(t.String()),
        reason: t.Optional(t.String()),
      }),
    },
  )
  .delete(
    "/:id",
    async ({ params, taggingPermissionsService }: any) => {
      await taggingPermissionsService.revoke(params.id);
      return { statusCode: 204, timestamp: new Date().toISOString() };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  );
