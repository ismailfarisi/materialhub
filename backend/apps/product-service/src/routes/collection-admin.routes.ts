import { ProductCollectionItemRole } from "@materialhub/database";
import { jwtAuth, requireRole } from "@materialhub/guards";
import { auditPlugin } from "@materialhub/plugins";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

// Accept null (not just absent) so the admin UI can clear rules on an existing
// collection; the service maps null → stored null.
const rulesSchema = t.Optional(
  t.Union([
    t.Object({
      v: t.Number(),
      match: t.Union([t.Literal("all"), t.Literal("any")]),
      conditions: t.Object({
        category_slugs: t.Optional(t.Array(t.String())),
        brand_slugs: t.Optional(t.Array(t.String())),
        tags: t.Optional(t.Array(t.String())),
        sku_in: t.Optional(t.Array(t.String())),
        price_min: t.Optional(t.Number()),
        price_max: t.Optional(t.Number()),
        in_stock: t.Optional(t.Boolean()),
      }),
    }),
    t.Null(),
  ]),
);

// Nullable optional string — accepts a string, null (to clear), or absence.
const nullableString = t.Optional(t.Union([t.String(), t.Null()]));

const sortEnum = t.Optional(
  t.Union([
    t.Literal("custom"),
    t.Literal("price_asc"),
    t.Literal("price_desc"),
    t.Literal("newest"),
    t.Literal("rating"),
  ]),
);

const kindEnum = t.Optional(t.Union([t.Literal("product"), t.Literal("variant")]));

export const collectionAdminRoutes = new Elysia({ prefix: "/admin/collections" })
  .use(container)
  .use(jwtAuth)
  .use(requireRole("admin", "super_admin"))
  .use(auditPlugin)

  .get(
    "/",
    async ({ query, collectionController }) => {
      const data = await collectionController.listForAdmin(
        query.page ? Number(query.page) : undefined,
        query.limit ? Number(query.limit) : undefined,
        query.search,
      );
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    {
      query: t.Object({
        page: t.Optional(t.String()),
        limit: t.Optional(t.String()),
        search: t.Optional(t.String()),
      }),
    },
  )

  .post(
    "/",
    async ({ body, collectionController, set }) => {
      const data = await collectionController.create(body as never);
      set.status = 201;
      return { statusCode: 201, data, timestamp: new Date().toISOString() };
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 255 }),
        slug: t.Optional(t.String({ maxLength: 255 })),
        description: t.Optional(t.String()),
        kind: kindEnum,
        rules: rulesSchema,
        default_sort: sortEnum,
        max_products: t.Optional(t.Number()),
        starts_at: nullableString,
        ends_at: nullableString,
        is_active: t.Optional(t.Boolean()),
      }),
    },
  )

  .get(
    "/:id",
    async ({ params, collectionController }) => {
      const data = await collectionController.getById(params.id);
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )

  .get(
    "/:id/items",
    async ({ params, query, collectionController }) => {
      const role =
        query.role === "exclude"
          ? ProductCollectionItemRole.exclude
          : ProductCollectionItemRole.pin;
      const data = await collectionController.listItems(params.id, role);
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      query: t.Object({ role: t.Optional(t.Union([t.Literal("pin"), t.Literal("exclude")])) }),
    },
  )

  .patch(
    "/:id",
    async ({ params, body, collectionController }) => {
      const data = await collectionController.update(params.id, body as never);
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({
        name: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
        slug: t.Optional(t.String({ maxLength: 255 })),
        description: t.Optional(t.String()),
        kind: kindEnum,
        rules: rulesSchema,
        default_sort: sortEnum,
        max_products: t.Optional(t.Number()),
        starts_at: nullableString,
        ends_at: nullableString,
        is_active: t.Optional(t.Boolean()),
      }),
    },
  )

  .delete(
    "/:id",
    async ({ params, collectionController }) => {
      await collectionController.remove(params.id);
      return {
        statusCode: 200,
        message: "Collection deleted",
        timestamp: new Date().toISOString(),
      };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )

  .post(
    "/:id/items",
    async ({ params, body, collectionController, set }) => {
      set.status = 201;
      const role =
        body.role === "exclude" ? ProductCollectionItemRole.exclude : ProductCollectionItemRole.pin;
      const data = await collectionController.addItems(params.id, role, body.entries);
      return { statusCode: 201, data, timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({
        role: t.Union([t.Literal("pin"), t.Literal("exclude")]),
        entries: t.Array(
          t.Object({
            product_id: t.Optional(t.String({ format: "uuid" })),
            variant_id: t.Optional(t.String({ format: "uuid" })),
            source_sku: t.Optional(t.String()),
          }),
        ),
      }),
    },
  )

  .patch(
    "/:id/items/reorder",
    async ({ params, body, collectionController }) => {
      await collectionController.reorder(params.id, body.itemIds);
      return { statusCode: 200, message: "Reordered", timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({ itemIds: t.Array(t.String({ format: "uuid" })) }),
    },
  )

  .delete(
    "/:id/items/:itemId",
    async ({ params, collectionController }) => {
      await collectionController.removeItem(params.id, params.itemId);
      return { statusCode: 200, message: "Item removed", timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({
        id: t.String({ format: "uuid" }),
        itemId: t.String({ format: "uuid" }),
      }),
    },
  )

  .post(
    "/resolve-skus",
    async ({ body, collectionController }) => {
      const data = await collectionController.resolveSkus(
        (body.kind ?? "product") as never,
        body.skus,
      );
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    { body: t.Object({ kind: kindEnum, skus: t.Array(t.String()) }) },
  )

  .get(
    "/:id/preview",
    async ({ params, query, collectionController }) => {
      const data = await collectionController.preview(params.id, {
        sort: query.sort as never,
        page: query.page ? Number(query.page) : 1,
        perPage: query.perPage ? Math.min(Number(query.perPage), 100) : 24,
      });
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      query: t.Object({
        sort: t.Optional(t.String()),
        page: t.Optional(t.String()),
        perPage: t.Optional(t.String()),
      }),
    },
  );
