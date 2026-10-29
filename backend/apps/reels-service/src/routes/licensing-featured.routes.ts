import { Elysia, t } from "elysia";
import { container } from "../container.ts";

/** Public: featured licensed reels for a product PDP or a vendor storefront. */
export const licensingFeaturedRoutes = new Elysia({ prefix: "/reels" }).use(container).get(
  "/featured",
  // biome-ignore lint/suspicious/noExplicitAny: handler context typing follows the slice-1 route pattern
  async ({ query, rightsService }: any) => {
    const data = await rightsService.listFeaturedReels({
      productId: query.product_id,
      vendorId: query.vendor_id,
    });
    return { statusCode: 200, data, timestamp: new Date().toISOString() };
  },
  { query: t.Object({ product_id: t.Optional(t.String()), vendor_id: t.Optional(t.String()) }) },
);
