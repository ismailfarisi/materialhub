import { jwtAuth, requireRole } from "@materialhub/guards";
import { auditPlugin } from "@materialhub/plugins";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";

export const attributeAdminRoutes = new Elysia({ prefix: "/admin/attributes" })
  .use(container)
  .use(jwtAuth)
  .use(requireRole("admin", "super_admin"))
  .use(auditPlugin)

  .get("/", async ({ query, attributeController }) => {
    const data = await attributeController.list(
      query.page ? Number(query.page) : undefined,
      query.limit ? Number(query.limit) : undefined,
      query.type,
    );
    return { statusCode: 200, data, timestamp: new Date().toISOString() };
  })

  .post(
    "/",
    async ({ body, attributeController, set }) => {
      const data = await attributeController.create(body);
      set.status = 201;
      return { statusCode: 201, data, timestamp: new Date().toISOString() };
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 200 }),
        ar_label: t.Optional(t.Nullable(t.String({ maxLength: 200 }))),
        type: t.String({ minLength: 1 }),
        is_filterable: t.Optional(t.Boolean()),
        is_variant: t.Optional(t.Boolean()),
        is_groupable: t.Optional(t.Boolean()),
        filter_input_type: t.Optional(
          t.Nullable(
            t.Union([
              t.Literal("checkbox"),
              t.Literal("color_swatch"),
              t.Literal("radio"),
              t.Literal("range"),
              t.Literal("toggle"),
            ]),
          ),
        ),
      }),
    },
  )

  .patch(
    "/:id",
    async ({ params, body, attributeController }) => {
      const data = await attributeController.update(params.id, body);
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({
        name: t.Optional(t.String({ minLength: 1, maxLength: 200 })),
        ar_label: t.Optional(t.Nullable(t.String({ maxLength: 200 }))),
        type: t.Optional(t.String()),
        is_filterable: t.Optional(t.Boolean()),
        is_variant: t.Optional(t.Boolean()),
        is_groupable: t.Optional(t.Boolean()),
        filter_input_type: t.Optional(
          t.Nullable(
            t.Union([
              t.Literal("checkbox"),
              t.Literal("color_swatch"),
              t.Literal("radio"),
              t.Literal("range"),
              t.Literal("toggle"),
            ]),
          ),
        ),
      }),
    },
  )

  .delete(
    "/:id",
    async ({ params, attributeController }) => {
      await attributeController.remove(params.id);
      return {
        statusCode: 200,
        message: "Attribute deleted",
        timestamp: new Date().toISOString(),
      };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )

  // Attribute values
  .get(
    "/:id/values",
    async ({ params, attributeController }) => {
      const data = await attributeController.getValues(params.id);
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )

  .post(
    "/:id/values",
    async ({ params, body, attributeController, set }) => {
      const data = await attributeController.addValue(params.id, body);
      set.status = 201;
      return { statusCode: 201, data, timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({
        value: t.String({ minLength: 1 }),
        display_value: t.Optional(t.String()),
        color_hex: t.Optional(t.Union([t.String(), t.Null()])),
        swatch_image_url: t.Optional(t.Union([t.String(), t.Null()])),
        sort_order: t.Optional(t.Number({ minimum: 0 })),
      }),
    },
  )

  .patch(
    "/:id/values/:valId",
    async ({ params, body, attributeController }) => {
      const data = await attributeController.updateValue(params.id, params.valId, body);
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({
        id: t.String({ format: "uuid" }),
        valId: t.String({ format: "uuid" }),
      }),
      body: t.Object({
        value: t.Optional(t.String({ minLength: 1 })),
        display_value: t.Optional(t.String()),
        color_hex: t.Optional(t.Union([t.String(), t.Null()])),
        swatch_image_url: t.Optional(t.Union([t.String(), t.Null()])),
        sort_order: t.Optional(t.Number({ minimum: 0 })),
      }),
    },
  )

  .delete(
    "/:id/values/:valId",
    async ({ params, attributeController }) => {
      await attributeController.removeValue(params.id, params.valId);
      return {
        statusCode: 200,
        message: "Value deleted",
        timestamp: new Date().toISOString(),
      };
    },
    {
      params: t.Object({
        id: t.String({ format: "uuid" }),
        valId: t.String({ format: "uuid" }),
      }),
    },
  );
