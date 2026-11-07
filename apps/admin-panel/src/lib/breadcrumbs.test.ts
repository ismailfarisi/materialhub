import { describe, expect, test } from "vitest";
import { getBreadcrumbs } from "./breadcrumbs";

describe("getBreadcrumbs", () => {
  test("group folders without a page render as text, not links", () => {
    const crumbs = getBreadcrumbs("/catalog/products");
    expect(crumbs).toEqual([
      { label: "Dashboard", href: "/" },
      { label: "Catalog", href: undefined },
      { label: "Products", href: undefined },
    ]);
    for (const p of ["/cms/pages", "/settings/payment-methods", "/bulk/imports"]) {
      expect(getBreadcrumbs(p)[1].href).toBeUndefined();
    }
  });

  test("real intermediate pages still link", () => {
    const crumbs = getBreadcrumbs("/catalog/products/0b8f7c56-6c5f-4b6a-9d7e-2a1b3c4d5e6f");
    expect(crumbs[2]).toEqual({ label: "Products", href: "/catalog/products" });
    expect(crumbs[3]).toEqual({ label: "Product", href: undefined });
  });

  test("id folders with only a nested page don't link", () => {
    const id = "0b8f7c56-6c5f-4b6a-9d7e-2a1b3c4d5e6f";
    const crumbs = getBreadcrumbs(`/cms/pages/${id}/edit`);
    expect(crumbs.map((c) => c.href)).toEqual(["/", undefined, "/cms/pages", undefined, undefined]);
    expect(getBreadcrumbs(`/integrations/${id}/pending-writes`)[2].href).toBeUndefined();
  });
});
