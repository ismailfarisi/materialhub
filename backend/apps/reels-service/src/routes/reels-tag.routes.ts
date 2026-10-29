import { jwtAuth } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";
import {
  activeVendorHeader,
  resolveActiveVendorIdWithFallback,
} from "../domain/reels/active-vendor.ts";
import { TaggableProductsUnavailableError } from "../domain/reels/taggable-products.service.ts";

export const reelsTagRoutes = new Elysia({ prefix: "/reels" })
  .use(container)
  .use(jwtAuth)
  .post(
    "/:id/tags",
    async ({ params, body, user, vendorMemberships, headers, reelTagService }: any) => {
      const activeVendorId = await resolveActiveVendorIdWithFallback(
        vendorMemberships,
        activeVendorHeader(headers),
        user!.id,
      );
      const tag = await reelTagService.addTag({
        reelId: params.id,
        userId: user!.id,
        activeVendorId,
        productId: body.productId,
        variantId: body.variantId,
        timestampSeconds: body.timestampSeconds,
        displayX: body.displayX,
        displayY: body.displayY,
      });
      return {
        statusCode: 201,
        data: tag,
        timestamp: new Date().toISOString(),
      };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({
        productId: t.String({ format: "uuid" }),
        variantId: t.Optional(t.String({ format: "uuid" })),
        timestampSeconds: t.Number({ minimum: 0 }),
        displayX: t.Optional(t.Number()),
        displayY: t.Optional(t.Number()),
      }),
    },
  )
  .delete(
    "/:id/tags/:tagId",
    async ({ params, user, reelTagService }: any) => {
      await reelTagService.removeTag(params.id, params.tagId, user!.id);
      return { statusCode: 204, timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({
        id: t.String({ format: "uuid" }),
        tagId: t.String({ format: "uuid" }),
      }),
    },
  );

export const meReelsRoutes = new Elysia({ prefix: "/me/reels" })
  .use(container)
  .use(jwtAuth)
  .get(
    "/taggable-products",
    async ({ query, user, vendorMemberships, headers, taggableProductsService, set }: any) => {
      try {
        const activeVendorId = await resolveActiveVendorIdWithFallback(
          vendorMemberships,
          activeVendorHeader(headers),
          user!.id,
        );
        const { items, partialSources } = await taggableProductsService.list({
          userId: user!.id,
          activeVendorId,
          q: query.q ?? "",
          limit: query.limit ?? 20,
        });
        if (partialSources.length > 0) {
          set.headers["x-partial"] = partialSources.join(",");
        }
        return {
          statusCode: 200,
          data: { items },
          timestamp: new Date().toISOString(),
        };
      } catch (err) {
        if (err instanceof TaggableProductsUnavailableError) {
          set.status = 503;
          return {
            statusCode: 503,
            error: "taggable_products_unavailable",
            timestamp: new Date().toISOString(),
          };
        }
        throw err;
      }
    },
    {
      query: t.Object({
        q: t.Optional(t.String({ maxLength: 64 })),
        limit: t.Optional(t.Integer({ minimum: 1, maximum: 50 })),
      }),
    },
  );
