import { config } from "@materialhub/config";
import { jwtAuth, requireRole } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import jwt from "jsonwebtoken";
import { container } from "../container.ts";

function issueDraftPreviewToken(layoutId: string, requestor: "admin" | "vendor") {
  const expiresInSec = 600;
  const token = jwt.sign(
    { layout_id: layoutId, version: "draft", requestor, aud: "preview" },
    config.jwt.accessSecret,
    { algorithm: "HS256", expiresIn: expiresInSec },
  );
  return {
    token,
    expires_at: new Date(Date.now() + expiresInSec * 1000).toISOString(),
  };
}

export const layoutRoutes = new Elysia({ prefix: "/admin/layouts" })
  .use(container)

  // ─── Admin Routes ────────────────────────────────────────────────────────
  .use(jwtAuth)
  .use(requireRole("admin", "super_admin"))

  // ─── Layout CRUD ─────────────────────────────────────────────────────────
  .get(
    "/",
    async ({ query, layoutController }) => {
      const data = await layoutController.list(query);
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    {
      query: t.Object({
        page: t.Optional(t.Number({ minimum: 1 })),
        limit: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
        status: t.Optional(t.String()),
        vendor_id: t.Optional(t.Union([t.String({ format: "uuid" }), t.Literal("null")])),
      }),
    },
  )

  .get(
    "/:id",
    async ({ params, layoutController }) => {
      const data = await layoutController.getById(params.id);
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )

  .post(
    "/",
    async ({ body, layoutController, user, set }) => {
      const data = await layoutController.create(body, user!.id);
      set.status = 201;
      return { statusCode: 201, data, timestamp: new Date().toISOString() };
    },
    {
      body: t.Object({
        slug: t.String({ pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" }),
        title: t.Record(t.String(), t.String()),
      }),
    },
  )

  .put(
    "/:id",
    async ({ params, body, layoutController }) => {
      const data = await layoutController.update(params.id, body);
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({
        slug: t.Optional(t.String({ pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" })),
        title: t.Optional(t.Record(t.String(), t.String())),
        suspend: t.Optional(t.Boolean()),
      }),
    },
  )

  .delete(
    "/:id",
    async ({ params, layoutController }) => {
      await layoutController.remove(params.id);
      return { statusCode: 200, message: "Layout deleted", timestamp: new Date().toISOString() };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )

  // ─── Versioning ───────────────────────────────────────────────────────────
  .get(
    "/:id/versions",
    async ({ params, layoutController }) => {
      const data = await layoutController.listVersions(params.id);
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )

  .post(
    "/:id/versions",
    async ({ params, layoutController, user, set }) => {
      const data = await layoutController.createVersion(params.id, user!.id);
      set.status = 201;
      return { statusCode: 201, data, timestamp: new Date().toISOString() };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )

  .post(
    "/:id/publish",
    async ({ params, layoutController }) => {
      const data = await layoutController.publish(params.id);
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )

  .post(
    "/:id/preview-token",
    async ({ params, layoutController }) => {
      // Validate layout exists (will throw 404 otherwise) so we never hand
      // out tokens for ids the caller can't actually preview.
      const layout = await layoutController.getById(params.id);
      const tokenInfo = issueDraftPreviewToken(params.id, "admin");
      return {
        statusCode: 200,
        data: { ...tokenInfo, layout_slug: layout.slug },
        timestamp: new Date().toISOString(),
      };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )

  .post(
    "/:id/schedule",
    async ({ params, body, layoutController }) => {
      const data = await layoutController.schedule(params.id, body.publish_at);
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({
        publish_at: t.String({ format: "date-time" }),
      }),
    },
  )

  .post(
    "/:id/rollback/:versionId",
    async ({ params, layoutController }) => {
      const data = await layoutController.rollback(params.id, params.versionId);
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({
        id: t.String({ format: "uuid" }),
        versionId: t.String({ format: "uuid" }),
      }),
    },
  )

  // ─── Sections (on draft version) ─────────────────────────────────────────
  .get(
    "/:id/sections",
    async ({ params, layoutController }) => {
      const data = await layoutController.listSections(params.id);
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )

  .post(
    "/:id/sections",
    async ({ params, body, layoutController, set }) => {
      const data = await layoutController.addSection(params.id, body as any);
      set.status = 201;
      return { statusCode: 201, data, timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({
        section_type_id: t.String({ format: "uuid" }),
        position: t.Integer({ minimum: 0 }),
        source_mode: t.Optional(
          t.Union([t.Literal("manual"), t.Literal("query"), t.Literal("bidded")]),
        ),
        enabled: t.Optional(t.Boolean()),
        visibility: t.Optional(
          t.Object({
            mobile: t.Boolean(),
            web: t.Boolean(),
          }),
        ),
        targeting: t.Optional(t.Record(t.String(), t.Unknown())),
        settings: t.Optional(t.Record(t.String(), t.Unknown())),
        data_source: t.Optional(t.Record(t.String(), t.Unknown())),
        blocks: t.Optional(t.Array(t.Unknown())),
        bid_config: t.Optional(t.Record(t.String(), t.Unknown())),
      }),
    },
  )

  // NOTE: reorder MUST be defined BEFORE /:id/sections/:sectionId
  // to prevent "reorder" being matched as sectionId param
  .put(
    "/:id/sections/reorder",
    async ({ params, body, layoutController }) => {
      const data = await layoutController.reorderSections(params.id, body.sections);
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({
        sections: t.Array(
          t.Object({
            id: t.String({ format: "uuid" }),
            position: t.Integer({ minimum: 0 }),
          }),
        ),
      }),
    },
  )

  .put(
    "/:id/sections/:sectionId",
    async ({ params, body, layoutController }) => {
      const data = await layoutController.updateSection(params.id, params.sectionId, body as any);
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({
        id: t.String({ format: "uuid" }),
        sectionId: t.String({ format: "uuid" }),
      }),
      body: t.Object({
        section_type_id: t.Optional(t.String({ format: "uuid" })),
        position: t.Optional(t.Integer({ minimum: 0 })),
        source_mode: t.Optional(
          t.Union([t.Literal("manual"), t.Literal("query"), t.Literal("bidded")]),
        ),
        enabled: t.Optional(t.Boolean()),
        visibility: t.Optional(
          t.Object({
            mobile: t.Boolean(),
            web: t.Boolean(),
          }),
        ),
        targeting: t.Optional(t.Record(t.String(), t.Unknown())),
        settings: t.Optional(t.Record(t.String(), t.Unknown())),
        data_source: t.Optional(t.Record(t.String(), t.Unknown())),
        blocks: t.Optional(t.Array(t.Unknown())),
        bid_config: t.Optional(t.Record(t.String(), t.Unknown())),
      }),
    },
  )

  .delete(
    "/:id/sections/:sectionId",
    async ({ params, layoutController }) => {
      await layoutController.removeSection(params.id, params.sectionId);
      return { statusCode: 200, message: "Section removed", timestamp: new Date().toISOString() };
    },
    {
      params: t.Object({
        id: t.String({ format: "uuid" }),
        sectionId: t.String({ format: "uuid" }),
      }),
    },
  );
