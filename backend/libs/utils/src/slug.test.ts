import { describe, expect, test } from "bun:test";
import { generateSlug } from "./slug.ts";

describe("generateSlug", () => {
  test("basic English text", () => {
    expect(generateSlug("Cotton T-Shirt")).toBe("cotton-t-shirt");
  });

  test("removes special characters", () => {
    expect(generateSlug("Hello & World! @2026")).toBe("hello-world-2026");
  });

  test("trims leading/trailing hyphens", () => {
    expect(generateSlug("  --hello--  ")).toBe("hello");
  });

  test("transliterates Arabic text", () => {
    const slug = generateSlug("ملابس رجالية");
    expect(slug).toMatch(/^[a-z0-9-]+$/);
    expect(slug.length).toBeGreaterThan(0);
  });

  test("handles mixed Arabic and English", () => {
    const slug = generateSlug("فستان Evening Dress");
    expect(slug).toMatch(/^[a-z0-9-]+$/);
    expect(slug).toContain("evening-dress");
  });

  test("collapses multiple hyphens", () => {
    expect(generateSlug("a   ---   b")).toBe("a-b");
  });
});
