import { describe, expect, test } from "bun:test";
import { coerceProductRow } from "../catalog-import.coerce.ts";
import { importStatusFor } from "../catalog-import.write.ts";

describe("catalog import status rules (no moderation bypass)", () => {
  test("new rows may be draft, pending_review or archived; default untouched", () => {
    expect(importStatusFor(null, "draft")).toBe("draft");
    expect(importStatusFor(null, "pending_review")).toBe("pending_review");
    expect(importStatusFor(null, "archived")).toBe("archived");
    expect(importStatusFor(null, null)).toBeUndefined();
  });

  test("a live or approved product is not demoted by an import row", () => {
    for (const current of ["published", "approved", "unpublished"]) {
      expect(importStatusFor(current, "draft")).toBeUndefined();
      expect(importStatusFor(current, "pending_review")).toBeUndefined();
    }
  });

  test("a rejected product may be resubmitted; anything may be archived", () => {
    expect(importStatusFor("rejected", "pending_review")).toBe("pending_review");
    expect(importStatusFor("published", "archived")).toBe("archived");
  });

  test("'active' / 'published' are not accepted in the status column", () => {
    for (const status of ["active", "published"]) {
      const r = coerceProductRow({
        rowNumber: 2,
        sheetName: "Products",
        values: {
          sku: "KRF-1",
          name: "Kraft Paper",
          category_slug: "kraft-papers",
          price: "900",
          status,
        },
      } as any);
      expect(r.ok).toBe(false);
    }
  });
});
