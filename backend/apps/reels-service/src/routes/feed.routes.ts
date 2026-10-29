import { jwtAuth } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";
import { hydrateFeedReelTags } from "../domain/feed/hydrate-feed-tags.ts";

export const feedRoutes = new Elysia({ prefix: "/reels/feed" })
  .use(container)
  .use(jwtAuth)
  .get(
    "/",
    async ({ query, user, feedService }: any) => {
      const limit = Math.min(Number(query.limit ?? 20), 50);
      const userId = user?.id ?? null;
      const language = query.language ?? user?.preferredLanguage ?? "en";
      const country = query.country ?? "AE";

      const respond = async (result: { reels: any[]; nextCursor: string | null }) => {
        await hydrateFeedReelTags(result.reels);
        return {
          statusCode: 200,
          ...result,
          timestamp: new Date().toISOString(),
        };
      };

      if (query.context === "home") {
        return respond(
          await feedService.getHomeFeed({
            tab: (query.tab ?? "for_you") as any,
            language,
            country,
            userId,
            cursor: query.cursor,
            limit,
          }),
        );
      }
      if (query.context === "product") {
        return respond(
          await feedService.getProductFeed(query.productId, {
            userId,
            cursor: query.cursor,
            limit,
            authorKind: query.author_kind === "all" ? undefined : query.author_kind,
          }),
        );
      }
      if (query.context === "brand") {
        return respond(
          await feedService.getBrandFeed(query.brandId, {
            userId,
            cursor: query.cursor,
            limit,
          }),
        );
      }
      if (query.context === "vendor") {
        return respond(
          await feedService.getVendorFeed(query.vendorId, {
            userId,
            cursor: query.cursor,
            limit,
          }),
        );
      }
      if (query.context === "user") {
        return respond(
          await feedService.getUserFeed(query.userId, {
            cursor: query.cursor,
            limit,
          }),
        );
      }
      if (query.context === "category") {
        const hasId = !!query.categoryId;
        const hasSlug = !!query.categorySlug;
        if (hasId === hasSlug) {
          return {
            statusCode: 400,
            error: hasId ? "category_ref_exclusive" : "category_ref_required",
            timestamp: new Date().toISOString(),
          };
        }
        try {
          return respond(
            await feedService.getCategoryFeed(
              { id: query.categoryId, slug: query.categorySlug },
              {
                userId,
                cursor: query.cursor,
                limit,
                language,
                country,
              },
            ),
          );
        } catch (e: any) {
          if (e?.message === "unknown_category") {
            return {
              statusCode: 400,
              error: "unknown_category",
              timestamp: new Date().toISOString(),
            };
          }
          throw e;
        }
      }
      return {
        statusCode: 400,
        error: "unknown_context",
        timestamp: new Date().toISOString(),
      };
    },
    {
      query: t.Object({
        context: t.Union([
          t.Literal("home"),
          t.Literal("product"),
          t.Literal("brand"),
          t.Literal("vendor"),
          t.Literal("user"),
          t.Literal("category"),
        ]),
        tab: t.Optional(
          t.Union([t.Literal("for_you"), t.Literal("latest"), t.Literal("following")]),
        ),
        productId: t.Optional(t.String({ format: "uuid" })),
        brandId: t.Optional(t.String({ format: "uuid" })),
        vendorId: t.Optional(t.String({ format: "uuid" })),
        userId: t.Optional(t.String({ format: "uuid" })),
        categoryId: t.Optional(t.String({ format: "uuid" })),
        categorySlug: t.Optional(t.String()),
        language: t.Optional(t.String()),
        country: t.Optional(t.String()),
        cursor: t.Optional(t.String()),
        limit: t.Optional(t.Numeric()),
        author_kind: t.Optional(
          t.Union([
            t.Literal("creator"),
            t.Literal("customer"),
            t.Literal("house"),
            t.Literal("all"),
          ]),
        ),
      }),
    },
  );
