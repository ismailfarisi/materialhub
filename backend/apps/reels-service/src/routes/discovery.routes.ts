import { jwtAuth, vendorMembership } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";
import type { MineSort } from "../domain/discovery/discovery.service.ts";

const MINE_SORTS = ["recent", "most_viewed", "most_gmv", "most_taps"] as const;
function parseMineSort(raw: unknown): MineSort {
  return typeof raw === "string" && (MINE_SORTS as readonly string[]).includes(raw)
    ? (raw as MineSort)
    : "recent";
}

export const discoveryRoutes = new Elysia({ prefix: "/vendor/reels/discovery" })
  .use(container)
  .use(jwtAuth)
  .use(vendorMembership("analytics.read"))
  .get(
    "/mine",
    async ({ query, member, discoveryService }: any) => {
      const data = await discoveryService.mine({
        vendorId: member.vid,
        sort: parseMineSort(query.sort),
        productId: query.product_id ?? null,
        limit: query.limit,
        offset: query.offset,
      });
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    {
      query: t.Object({
        sort: t.Optional(t.String()),
        product_id: t.Optional(t.String()),
        limit: t.Optional(t.Numeric()),
        offset: t.Optional(t.Numeric()),
      }),
    },
  )
  .get(
    "/browse",
    async ({ query, member, discoveryService }: any) => {
      const data = await discoveryService.browse({
        vendorId: member.vid,
        sort: query.sort === "recent" ? "recent" : "ranking",
        categoryId: query.category_id ?? null,
        creatorId: query.creator_id ?? null,
        keyword: query.q ?? null,
        language: query.language ?? null,
        limit: query.limit,
        offset: query.offset,
      });
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    {
      query: t.Object({
        sort: t.Optional(t.String()),
        category_id: t.Optional(t.String()),
        creator_id: t.Optional(t.String()),
        q: t.Optional(t.String()),
        language: t.Optional(t.String()),
        limit: t.Optional(t.Numeric()),
        offset: t.Optional(t.Numeric()),
      }),
    },
  );
