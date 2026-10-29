import { describe, expect, it } from "bun:test";
import { PayoutRail } from "./vendor.enums.ts";

describe("PayoutRail", () => {
  it("has exactly the two shipped rails", () => {
    expect(Object.values(PayoutRail).sort()).toEqual(["manual_bank_transfer", "stripe_connect"]);
  });
});
