import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import { buildProductExportRoutes } from "../product-export.routes.ts";

describe("product export routes", () => {
  test("fields endpoint delegates to service metadata", async () => {
    const app = new Elysia()
      .derive(() => ({
        user: { id: "u1", role: "admin" },
        bulkAccess: {
          role: "admin",
          ownVendorIds: [],
        },
      }))
      .use(
        buildProductExportRoutes({
          getMetadata: () => ({
            presets: [{ key: "catalog_overview" }],
            fieldGroups: [],
            fields: [],
            filters: {},
          }),
          createProductExport: async () => ({ id: "j1" }),
          listExports: async () => ({ items: [], total: 0, page: 1, pageSize: 20 }),
          getExport: async () => null,
          getDownloadUrl: async () => null,
        } as never),
      );

    const res = await app.handle(new Request("http://localhost/bulk/exports/products/fields"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      presets: [{ key: "catalog_overview" }],
      fieldGroups: [],
      fields: [],
      filters: {},
    });
  });

  test("create endpoint passes caller and request to service", async () => {
    const calls: unknown[] = [];
    const app = new Elysia()
      .derive(() => ({
        user: { id: "u1", role: "customer" },
        bulkAccess: {
          role: "customer",
          ownVendorIds: ["v1"],
        },
      }))
      .use(
        buildProductExportRoutes({
          getMetadata: () => ({ presets: [], fieldGroups: [], fields: [], filters: {} }),
          createProductExport: async (args: unknown) => {
            calls.push(args);
            return { id: "j1", status: "queued" };
          },
          listExports: async () => ({ items: [], total: 0, page: 1, pageSize: 20 }),
          getExport: async () => null,
          getDownloadUrl: async () => null,
        } as never),
      );

    const res = await app.handle(
      new Request("http://localhost/bulk/exports/products", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          format: "csv",
          preset: "custom",
          fieldGroups: ["identity"],
          filters: { status: "active" },
        }),
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "j1", status: "queued" });
    expect(calls[0]).toEqual({
      caller: { userId: "u1", role: "customer", vendorIds: ["v1"] },
      request: {
        format: "csv",
        preset: "custom",
        fieldGroups: ["identity"],
        filters: { status: "active" },
      },
    });
  });
});
