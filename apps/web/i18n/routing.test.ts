import { describe, expect, it } from "vitest";
import { routing } from "./routing";

describe("storefront routing", () => {
  it("only exposes English and Arabic locales", () => {
    expect(routing.locales).toEqual(["en", "ar"]);
  });
});
