import { Elysia, t } from "elysia";
import type { ProductExportService } from "./product-export.service.ts";

const ProductExportCreateBody = t.Object({
  format: t.Union([t.Literal("csv"), t.Literal("xlsx")]),
  preset: t.Union([
    t.Literal("catalog_overview"),
    t.Literal("pricing"),
    t.Literal("inventory"),
    t.Literal("media_health"),
    t.Literal("seo"),
    t.Literal("custom"),
  ]),
  fieldGroups: t.Array(t.String()),
  fields: t.Optional(t.Array(t.String())),
  filters: t.Optional(
    t.Object({
      vendorId: t.Optional(t.String()),
      status: t.Optional(t.String()),
      categoryId: t.Optional(t.String()),
      brandId: t.Optional(t.String()),
      stockState: t.Optional(
        t.Union([t.Literal("in_stock"), t.Literal("low_stock"), t.Literal("out_of_stock")]),
      ),
      publishState: t.Optional(t.String()),
      search: t.Optional(t.String()),
      createdFrom: t.Optional(t.String()),
      createdTo: t.Optional(t.String()),
      updatedFrom: t.Optional(t.String()),
      updatedTo: t.Optional(t.String()),
    }),
  ),
});

const ExportListQuery = t.Object({
  vendorId: t.Optional(t.String()),
  page: t.Optional(t.Integer({ minimum: 1, default: 1 })),
  pageSize: t.Optional(t.Integer({ minimum: 1, maximum: 100, default: 20 })),
});

const ExportIdParam = t.Object({ id: t.String() });

// biome-ignore lint/suspicious/noExplicitAny: Elysia set is inferred after route composition.
function unauth(set: any) {
  set.status = 401;
  return {
    statusCode: 401,
    message: "Authentication required",
    error: "UNAUTHORIZED",
    timestamp: new Date().toISOString(),
  };
}

function isAdmin(role: string): boolean {
  return role === "admin" || role === "super_admin";
}

// biome-ignore lint/suspicious/noExplicitAny: bulkAccess is added by the shared guard plugin.
function accessFromContext(ctx: any) {
  const access = ctx.bulkAccess;
  if (!access) return null;
  return {
    role: access.role as string,
    ownVendorIds: (access.ownVendorIds ?? []) as string[],
  };
}

// biome-ignore lint/suspicious/noExplicitAny: Elysia set is inferred after route composition.
function handleError(error: unknown, set: any) {
  const details =
    error instanceof Error
      ? (error as Error & { statusCode?: number; code?: string })
      : { message: String(error), statusCode: 500, code: null };
  set.status = details.statusCode ?? 500;
  return { error: details.message, code: details.code ?? null };
}

export function buildProductExportRoutes(service: ProductExportService, prefix = "/bulk/exports") {
  return (
    new Elysia({ prefix })
      // biome-ignore lint/suspicious/noExplicitAny: Elysia route context is augmented by auth/guard plugins.
      .get("/products/fields", (ctx: any) => {
        const access = accessFromContext(ctx);
        if (!access) return unauth(ctx.set);
        return service.getMetadata(access.role as never);
      })
      .post(
        "/products",
        // biome-ignore lint/suspicious/noExplicitAny: Elysia route context is augmented by auth/guard plugins.
        async (ctx: any) => {
          const access = accessFromContext(ctx);
          if (!access) return unauth(ctx.set);
          try {
            return await service.createProductExport({
              caller: {
                userId: ctx.user!.id,
                role: access.role as never,
                vendorIds: access.ownVendorIds,
              },
              request: ctx.body,
            });
          } catch (error) {
            return handleError(error, ctx.set);
          }
        },
        { body: ProductExportCreateBody },
      )
      .get(
        "/",
        // biome-ignore lint/suspicious/noExplicitAny: Elysia route context is augmented by auth/guard plugins.
        async (ctx: any) => {
          const access = accessFromContext(ctx);
          if (!access) return unauth(ctx.set);
          return service.listExports({
            admin: isAdmin(access.role),
            vendorId: access.ownVendorIds[0] ?? null,
            requestedVendorId: ctx.query.vendorId,
            page: ctx.query.page ?? 1,
            pageSize: ctx.query.pageSize ?? 20,
          });
        },
        { query: ExportListQuery },
      )
      .get(
        "/:id",
        // biome-ignore lint/suspicious/noExplicitAny: Elysia route context is augmented by auth/guard plugins.
        async (ctx: any) => {
          const access = accessFromContext(ctx);
          if (!access) return unauth(ctx.set);
          try {
            const job = await service.getExport(ctx.params.id, {
              admin: isAdmin(access.role),
              vendorId: access.ownVendorIds[0] ?? null,
            });
            if (!job) {
              ctx.set.status = 404;
              return { error: "not_found" };
            }
            return job;
          } catch (error) {
            return handleError(error, ctx.set);
          }
        },
        { params: ExportIdParam },
      )
      .get(
        "/:id/download",
        // biome-ignore lint/suspicious/noExplicitAny: Elysia route context is augmented by auth/guard plugins.
        async (ctx: any) => {
          const access = accessFromContext(ctx);
          if (!access) return unauth(ctx.set);
          try {
            const url = await service.getDownloadUrl(ctx.params.id, {
              admin: isAdmin(access.role),
              vendorId: access.ownVendorIds[0] ?? null,
            });
            if (!url) {
              ctx.set.status = 404;
              return { error: "not_ready" };
            }
            return { url };
          } catch (error) {
            return handleError(error, ctx.set);
          }
        },
        { params: ExportIdParam },
      )
  );
}
