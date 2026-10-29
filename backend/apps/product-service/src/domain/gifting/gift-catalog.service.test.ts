import { describe, expect, test } from "bun:test";
import { buildGiftSlug } from "./gift-catalog.service.ts";

describe("buildGiftSlug", () => {
  test("slugifies the name when no slug given", () => {
    expect(buildGiftSlug("Ramadan Luxury")).toBe("ramadan-luxury");
  });
  test("prefers explicit slug", () => {
    expect(buildGiftSlug("Ramadan Luxury", "ramadan")).toBe("ramadan");
  });
});
