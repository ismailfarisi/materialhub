import { describe, expect, it } from "bun:test";
import { assertWithinReturnWindow } from "./return-window.ts";

describe("assertWithinReturnWindow", () => {
  it("allows returns through 7 days after delivery", () => {
    expect(() =>
      assertWithinReturnWindow(
        new Date("2026-06-20T00:00:00.000Z"),
        new Date("2026-06-27T00:00:00.000Z"),
      ),
    ).not.toThrow();
  });

  it("rejects returns after 7 days from delivery", () => {
    expect(() =>
      assertWithinReturnWindow(
        new Date("2026-06-20T00:00:00.000Z"),
        new Date("2026-06-28T00:00:01.000Z"),
      ),
    ).toThrow("Return window has expired");
  });
});
