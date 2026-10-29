/**
 * Guards the regression where the vendor product write routes omitted the SEO
 * fields from their body schema — Elysia silently stripped meta_title /
 * meta_description / meta_keywords, so vendor SEO settings were never saved.
 *
 * Mounts a bare Elysia app using the exact schema fragments the real routes
 * spread into their bodies, and asserts the handler still sees the fields.
 */

import { describe, expect, it } from "bun:test";
import { Elysia, t } from "elysia";
import {
  ProductCreateInventoryInput,
  ProductSeoInput,
  VendorStatusInput,
} from "../product-input.schemas.ts";

const app = new Elysia()
  .patch("/products/:id", ({ body }) => body, {
    body: t.Object({
      name: t.Optional(t.String()),
      status: VendorStatusInput,
      ...ProductSeoInput,
    }),
  })
  .post("/products", ({ body }) => body, {
    body: t.Object({
      name: t.String(),
      status: VendorStatusInput,
      ...ProductSeoInput,
      ...ProductCreateInventoryInput,
    }),
  });

async function patch(body: unknown) {
  const res = await app.handle(
    new Request("http://localhost/products/p1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  const parsed = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  return { status: res.status, body: parsed };
}

describe("vendor product write body schema", () => {
  it("preserves SEO fields instead of stripping them", async () => {
    const { status, body } = await patch({
      name: "Rose Serum",
      meta_title: "Rose Serum | MaterialHub",
      meta_description: "A hydrating rose serum.",
      meta_keywords: ["rose", "serum"],
    });

    expect(status).toBe(200);
    expect(body).toMatchObject({
      meta_title: "Rose Serum | MaterialHub",
      meta_description: "A hydrating rose serum.",
      meta_keywords: ["rose", "serum"],
    });
  });

  it("accepts meta_keywords as a comma-separated string", async () => {
    const { status, body } = await patch({ meta_keywords: "rose, serum" });
    expect(status).toBe(200);
    expect(body?.meta_keywords).toBe("rose, serum");
  });

  it("accepts null SEO fields so a vendor can clear them", async () => {
    const { status, body } = await patch({
      meta_title: null,
      meta_description: null,
      meta_keywords: null,
    });

    expect(status).toBe(200);
    expect(body).toMatchObject({
      meta_title: null,
      meta_description: null,
      meta_keywords: null,
    });
  });

  it("preserves a draft/pending_review status", async () => {
    const { status, body } = await patch({ status: "pending_review" });
    expect(status).toBe(200);
    expect(body?.status).toBe("pending_review");
  });

  it("rejects a vendor attempt to set status directly to published", async () => {
    const { status } = await patch({ status: "published" });
    expect(status).toBe(422);
  });

  it("rejects a meta_title longer than the column allows", async () => {
    const { status } = await patch({ meta_title: "x".repeat(256) });
    expect(status).toBe(422);
  });
});

async function post(body: unknown) {
  const res = await app.handle(
    new Request("http://localhost/products", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  const parsed = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  return { status: res.status, body: parsed };
}

describe("vendor product create body schema", () => {
  it("preserves has_variants instead of stripping it", async () => {
    const { status, body } = await post({ name: "Rose Serum", has_variants: true });
    expect(status).toBe(200);
    expect(body?.has_variants).toBe(true);
  });

  it("preserves the opening quantity_on_hand", async () => {
    const { status, body } = await post({ name: "Rose Serum", quantity_on_hand: 42 });
    expect(status).toBe(200);
    expect(body?.quantity_on_hand).toBe(42);
  });

  it("rejects a negative opening stock", async () => {
    const { status } = await post({ name: "Rose Serum", quantity_on_hand: -1 });
    expect(status).toBe(422);
  });
});
