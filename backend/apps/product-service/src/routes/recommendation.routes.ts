import { jwtAuth } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

export const recommendationRoutes = new Elysia()
  .use(container)

  .get(
    "/products/:id/recommendations",
    async ({ params, query, recommendationController }: any) => {
      const limit = query.limit ? Number(query.limit) : undefined;
      let data: any = [];
      switch (query.type) {
        case "more-from-brand":
          data = await recommendationController.moreFromBrand(params.id, limit);
          break;
        case "pairs-with":
          data = await recommendationController.pairsWith(params.id, limit);
          break;
        case "cross-brand":
          data = await recommendationController.crossBrand(params.id, limit);
          break;
        case "bestsellers":
          data = await recommendationController.bestsellersInCategory(params.id, limit);
          break;
        default:
          data = await recommendationController.youMightAlsoLike(params.id);
      }
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      query: t.Object({
        type: t.Optional(
          t.Union([
            t.Literal("more-from-brand"),
            t.Literal("pairs-with"),
            t.Literal("cross-brand"),
            t.Literal("bestsellers"),
          ]),
        ),
        limit: t.Optional(t.Integer({ minimum: 1, maximum: 24 })),
      }),
    },
  )

  .use(jwtAuth)
  .get(
    "/recommendations",
    async ({ query, user, recommendationController }: any) => {
      const data = await recommendationController.forUser(
        user!.id,
        query.limit ? Number(query.limit) : undefined,
      );
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    {
      query: t.Object({
        limit: t.Optional(t.Integer({ default: 12 })),
      }),
    },
  );
