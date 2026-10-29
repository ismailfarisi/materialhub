import { AppDataSource, ProductImage, ReelProductTag } from "@materialhub/database";
import { jwtAuth } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";
import { withGuestSession } from "../lib/guest-session.derive.ts";

/**
 * POST /reels/:id/tags/:tagId/taps
 *
 * Records a product-tag tap and returns the drawer payload. Auth is
 * optional — anonymous viewers with a valid `x-guest-session` also
 * produce a ReelAttribution row (session-only). Fully-anonymous
 * requests (no JWT and no valid guest-session token) still open the
 * drawer but do not produce a row.
 *
 * Anti-spoofing: the tag must belong to the reel in the URL path. If
 * the tag is missing, soft-deleted, or its reel_id doesn't match, the
 * endpoint returns a 410 `tag_or_product_unavailable` envelope.
 *
 * Attribution failures are swallowed — a transient write error should
 * not block the drawer from rendering on the client.
 */
export const attributionRoutes = new Elysia({ prefix: "/reels" })
  .use(container)
  .use(jwtAuth)
  .use(withGuestSession)
  .post(
    "/:id/tags/:tagId/taps",
    async ({ params, userId, guestSessionId, attributionService }: any) => {
      const tagRepo = AppDataSource.getRepository(ReelProductTag);
      const tag = await tagRepo.findOne({
        where: { id: params.tagId },
        relations: ["product"],
      });

      if (!tag || tag.reel_id !== params.id || !tag.product) {
        return {
          statusCode: 410,
          error: "tag_or_product_unavailable",
          timestamp: new Date().toISOString(),
        };
      }

      // Write an attribution row if we have ANY identity (user or guest session).
      // Fully-anonymous requests (no jwt + no valid guest session token) still
      // get the drawer; they just don't produce an attribution row.
      if (userId || guestSessionId) {
        try {
          await attributionService.recordTap({
            reelId: params.id,
            productId: tag.product_id,
            tagId: tag.id,
            buyerUserId: userId ?? null,
            sessionId: guestSessionId ?? null,
          });
        } catch (err) {
          // Attribution is best-effort — never block the drawer on write failures,
          // but log so regressions are visible before commission reconciliation breaks.
          console.error("[attribution] recordTap failed", {
            reelId: params.id,
            tagId: params.tagId,
            userId: userId ?? null,
            sessionId: guestSessionId ?? null,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      const product = tag.product as any;
      // Resolve the primary product image from product_images. Best-effort —
      // missing image is non-fatal (the drawer renders a fallback glyph).
      const image = await AppDataSource.getRepository(ProductImage)
        .findOne({
          where: { product_id: product.id },
          order: { is_primary: "DESC", sort_order: "ASC" },
        })
        .catch(() => null);
      return {
        statusCode: 200,
        data: {
          tag: {
            id: tag.id,
            timestampSeconds: Number(tag.timestamp_seconds),
            displayX: tag.display_x != null ? Number(tag.display_x) : null,
            displayY: tag.display_y != null ? Number(tag.display_y) : null,
          },
          product: {
            id: product.id,
            name: product.name,
            slug: product.slug,
            priceFils: Number(product.price ?? 0),
            imageUrl: image?.medium_url ?? image?.url ?? null,
            // No `in_stock` column on products — real availability lives
            // in `inventory`. Default to true; product-service owns the
            // authoritative check at add-to-cart time.
            inStock: true,
            brandId: product.brand_id ?? null,
            vendorId: product.vendor_id,
          },
        },
        timestamp: new Date().toISOString(),
      };
    },
    {
      params: t.Object({
        id: t.String({ format: "uuid" }),
        tagId: t.String({ format: "uuid" }),
      }),
    },
  );
