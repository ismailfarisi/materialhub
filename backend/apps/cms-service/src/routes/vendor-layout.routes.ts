import { config } from "@materialhub/config";
import { AppDataSource, LayoutSection, PageLayout } from "@materialhub/database";
import { jwtAuth, vendorMembership } from "@materialhub/guards";
import { HttpError } from "@materialhub/plugins";
import { Elysia, t } from "elysia";
import jwt from "jsonwebtoken";
import { container } from "../container.ts";

async function resolveLayoutId(params: {
  id?: string;
  sectionId?: string;
}): Promise<string | null> {
  if (params.id) return params.id;
  if (params.sectionId) {
    const section = await AppDataSource.getRepository(LayoutSection).findOne({
      where: { id: params.sectionId },
      relations: ["version"],
    });
    return section?.version?.layout_id ?? null;
  }
  return null;
}

async function assertVendorOwnsLayout(vendorId: string, layoutId: string): Promise<void> {
  const layout = await AppDataSource.getRepository(PageLayout).findOne({
    where: { id: layoutId },
  });
  if (!layout) throw new HttpError(404, "Layout not found", "LAYOUT_NOT_FOUND");
  if (layout.vendor_id === null) {
    throw new HttpError(
      403,
      "Admin layouts cannot be edited via vendor scope",
      "ADMIN_LAYOUT_FORBIDDEN",
    );
  }
  if (layout.vendor_id !== vendorId) {
    throw new HttpError(403, "You do not own this layout", "NOT_LAYOUT_OWNER");
  }
}

/** Test seams — exposed for unit testing only. Never call from production code. */
export const __resolveLayoutId = resolveLayoutId;
export const __assertVendorOwnsLayout = assertVendorOwnsLayout;

function issueDraftPreviewToken(layoutId: string, requestor: "vendor") {
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

const sectionBody = t.Object({
  section_type_id: t.String({ format: "uuid" }),
  position: t.Integer({ minimum: 0 }),
  source_mode: t.Optional(t.Union([t.Literal("manual"), t.Literal("query")])),
  enabled: t.Optional(t.Boolean()),
  visibility: t.Optional(t.Object({ mobile: t.Boolean(), web: t.Boolean() })),
  targeting: t.Optional(t.Record(t.String(), t.Unknown())),
  settings: t.Optional(t.Record(t.String(), t.Unknown())),
  data_source: t.Optional(t.Record(t.String(), t.Unknown())),
  blocks: t.Optional(t.Array(t.Unknown())),
});

const sectionPatchBody = t.Object({
  section_type_id: t.Optional(t.String({ format: "uuid" })),
  position: t.Optional(t.Integer({ minimum: 0 })),
  source_mode: t.Optional(t.Union([t.Literal("manual"), t.Literal("query")])),
  enabled: t.Optional(t.Boolean()),
  visibility: t.Optional(t.Object({ mobile: t.Boolean(), web: t.Boolean() })),
  targeting: t.Optional(t.Record(t.String(), t.Unknown())),
  settings: t.Optional(t.Record(t.String(), t.Unknown())),
  data_source: t.Optional(t.Record(t.String(), t.Unknown())),
  blocks: t.Optional(t.Array(t.Unknown())),
});

// Phase 2 migration: replaces `requireRole("vendor") + vendorOwnership` with
// permission-aware `vendorMembership(...)` guards. Most vendor-layout
// operations are gated by `vendor.profile.write` (owner / manager); the
// publish action requires the stronger `products.publish` (owner / manager).
// Phase 3a: `vendorLayoutOwnership` guard removed; ownership is now checked
// inline via `resolveLayoutId` + `assertVendorOwnsLayout` helpers above.
export const vendorLayoutRoutes = new Elysia({ prefix: "/vendor-layouts" })
  .use(container)
  .use(jwtAuth)
  .onError({ as: "scoped" }, ({ error, set }) => {
    if (error instanceof HttpError) {
      set.status = error.statusCode;
      return {
        statusCode: error.statusCode,
        error: error.code,
        message: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  })

  .guard({}, (app) =>
    app
      .use(vendorMembership("vendor.profile.write"))

      // Init / get my layout — no :id, ownership guard is a no-op
      .post("/me/init", async ({ member, user, vendorLayoutInitService, set }: any) => {
        const data = await vendorLayoutInitService.init(member.vid, user.id);
        set.status = 201;
        return { statusCode: 201, data, timestamp: new Date().toISOString() };
      })

      .get("/me", async ({ member, layoutController }: any) => {
        const data = await layoutController.findByVendorAndSlug(member.vid, "vendor-storefront");
        return { statusCode: 200, data, timestamp: new Date().toISOString() };
      })

      .get(
        "/:id",
        async ({ params, member, layoutController }: any) => {
          const layoutId = await resolveLayoutId({ id: params.id });
          if (layoutId) await assertVendorOwnsLayout(member.vid, layoutId);
          const data = await layoutController.getById(params.id);
          return { statusCode: 200, data, timestamp: new Date().toISOString() };
        },
        { params: t.Object({ id: t.String({ format: "uuid" }) }) },
      )

      .post(
        "/:id/preview-token",
        async ({ params, member, layoutController }: any) => {
          const layoutId = await resolveLayoutId({ id: params.id });
          if (layoutId) await assertVendorOwnsLayout(member.vid, layoutId);
          const layout = await layoutController.getById(params.id);
          const tokenInfo = issueDraftPreviewToken(params.id, "vendor");
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
        async ({ params, body, member, layoutController }: any) => {
          const layoutId = await resolveLayoutId({ id: params.id });
          if (layoutId) await assertVendorOwnsLayout(member.vid, layoutId);
          const data = await layoutController.schedule(params.id, body.publish_at);
          return { statusCode: 200, data, timestamp: new Date().toISOString() };
        },
        {
          params: t.Object({ id: t.String({ format: "uuid" }) }),
          body: t.Object({ publish_at: t.String({ format: "date-time" }) }),
        },
      )

      .post(
        "/:id/sections",
        async ({ params, body, member, layoutController, set }: any) => {
          const layoutId = await resolveLayoutId({ id: params.id });
          if (layoutId) await assertVendorOwnsLayout(member.vid, layoutId);
          const data = await layoutController.addSection(params.id, body as any, {
            enforceVendorScope: true,
          });
          set.status = 201;
          return { statusCode: 201, data, timestamp: new Date().toISOString() };
        },
        { params: t.Object({ id: t.String({ format: "uuid" }) }), body: sectionBody },
      )

      // NOTE: reorder MUST be defined BEFORE /:id/sections/:sectionId
      .put(
        "/:id/sections/reorder",
        async ({ params, body, member, layoutController }: any) => {
          const layoutId = await resolveLayoutId({ id: params.id });
          if (layoutId) await assertVendorOwnsLayout(member.vid, layoutId);
          const data = await layoutController.reorderSections(params.id, body.sections);
          return { statusCode: 200, data, timestamp: new Date().toISOString() };
        },
        {
          params: t.Object({ id: t.String({ format: "uuid" }) }),
          body: t.Object({
            sections: t.Array(
              t.Object({ id: t.String({ format: "uuid" }), position: t.Integer({ minimum: 0 }) }),
            ),
          }),
        },
      )

      .put(
        "/:id/sections/:sectionId",
        async ({ params, body, member, layoutController }: any) => {
          const layoutId = await resolveLayoutId({
            id: params.id,
            sectionId: params.sectionId,
          });
          if (layoutId) await assertVendorOwnsLayout(member.vid, layoutId);
          const data = await layoutController.updateSection(
            params.id,
            params.sectionId,
            body as any,
            { enforceVendorScope: true },
          );
          return { statusCode: 200, data, timestamp: new Date().toISOString() };
        },
        {
          params: t.Object({
            id: t.String({ format: "uuid" }),
            sectionId: t.String({ format: "uuid" }),
          }),
          body: sectionPatchBody,
        },
      )

      .delete(
        "/:id/sections/:sectionId",
        async ({ params, member, layoutController }: any) => {
          const layoutId = await resolveLayoutId({
            id: params.id,
            sectionId: params.sectionId,
          });
          if (layoutId) await assertVendorOwnsLayout(member.vid, layoutId);
          await layoutController.removeSection(params.id, params.sectionId);
          return {
            statusCode: 200,
            message: "Section removed",
            timestamp: new Date().toISOString(),
          };
        },
        {
          params: t.Object({
            id: t.String({ format: "uuid" }),
            sectionId: t.String({ format: "uuid" }),
          }),
        },
      ),
  )

  .guard({}, (app) =>
    app.use(vendorMembership("products.publish")).post(
      "/:id/publish",
      async ({ params, member, layoutController }: any) => {
        const layoutId = await resolveLayoutId({ id: params.id });
        if (layoutId) await assertVendorOwnsLayout(member.vid, layoutId);
        const data = await layoutController.publish(params.id);
        return { statusCode: 200, data, timestamp: new Date().toISOString() };
      },
      { params: t.Object({ id: t.String({ format: "uuid" }) }) },
    ),
  );
