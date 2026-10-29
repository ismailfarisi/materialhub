import { jwtAuth, requireRole } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

export const savedSearchRoutes = new Elysia({ prefix: "/saved-searches" })
  .use(container)
  .use(jwtAuth)
  .use(requireRole("customer", "admin", "super_admin"))

  .post(
    "/",
    async ({ body, user, savedSearchController, set }: any) => {
      const data = await savedSearchController.create(user!.id, body);
      set.status = 201;
      return { statusCode: 201, data, timestamp: new Date().toISOString() };
    },
    {
      body: t.Object({
        name: t.Optional(t.String({ maxLength: 255 })),
        query: t.String({ minLength: 1, maxLength: 500 }),
        filters: t.Optional(t.Record(t.String(), t.Unknown())),
        notify_on_match: t.Optional(t.Boolean()),
      }),
    },
  )

  .get(
    "/",
    async ({ query, user, savedSearchController }: any) => {
      const data = await savedSearchController.list(
        user!.id,
        query.page ? Number(query.page) : undefined,
        query.limit ? Number(query.limit) : undefined,
      );
      return { statusCode: 200, ...data, timestamp: new Date().toISOString() };
    },
    {
      query: t.Object({
        page: t.Optional(t.Integer({ default: 1 })),
        limit: t.Optional(t.Integer({ default: 20 })),
      }),
    },
  )

  .patch(
    "/:id",
    async ({ params, body, user, savedSearchController }: any) => {
      const data = await savedSearchController.update(params.id, user!.id, body);
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({
        name: t.Optional(t.String({ maxLength: 255 })),
        query: t.Optional(t.String({ minLength: 1, maxLength: 500 })),
        filters: t.Optional(t.Record(t.String(), t.Unknown())),
        notify_on_match: t.Optional(t.Boolean()),
      }),
    },
  )

  .delete(
    "/:id",
    async ({ params, user, savedSearchController }: any) => {
      await savedSearchController.delete(params.id, user!.id);
      return {
        statusCode: 200,
        message: "Saved search deleted",
        timestamp: new Date().toISOString(),
      };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  );
