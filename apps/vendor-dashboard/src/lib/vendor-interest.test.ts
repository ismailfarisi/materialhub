import { describe, expect, test } from "vitest";
import {
  buildVendorInterestSummary,
  vendorInterestSchema,
} from "./vendor-interest";

describe("vendor interest form", () => {
  test("accepts a complete interest request and trims values", () => {
    const result = vendorInterestSchema.parse({
      brandName: "  Gulf Packaging Supplies  ",
      contactName: "  Sara Vendor  ",
      email: "sara@example.com",
      category: "  Packaging papers  ",
      website: "  https://example.com  ",
      message: "  We supply kraft papers and rigid boards.  ",
    });

    expect(result).toEqual({
      brandName: "Gulf Packaging Supplies",
      contactName: "Sara Vendor",
      email: "sara@example.com",
      category: "Packaging papers",
      website: "https://example.com",
      message: "We supply kraft papers and rigid boards.",
    });
  });

  test("rejects missing required fields and invalid email", () => {
    const result = vendorInterestSchema.safeParse({
      brandName: "",
      contactName: "",
      email: "not-email",
      category: "",
      website: "",
      message: "",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.issues.map((issue) => issue.path.join("."));
      expect(fields).toContain("brandName");
      expect(fields).toContain("contactName");
      expect(fields).toContain("email");
      expect(fields).toContain("category");
    }
  });

  test("builds a readable received-state summary", () => {
    const summary = buildVendorInterestSummary({
      brandName: "Gulf Packaging Supplies",
      contactName: "Sara Vendor",
      email: "sara@example.com",
      category: "Packaging papers",
      website: "",
      message: "",
    });

    expect(summary).toBe("Gulf Packaging Supplies / Packaging papers / sara@example.com");
  });
});
