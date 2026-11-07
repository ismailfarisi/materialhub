import { describe, expect, it } from "bun:test";
import { shouldBecomeDefaultAccount } from "./default-shipping-account.ts";

const verified = { id: "acc-new", is_active: true, is_verified: true };

describe("shouldBecomeDefaultAccount", () => {
  it("makes the first verified account the default", () => {
    expect(shouldBecomeDefaultAccount({ default_shipping_account_id: null }, verified, null)).toBe(
      true,
    );
  });

  it("keeps a usable existing default", () => {
    expect(
      shouldBecomeDefaultAccount({ default_shipping_account_id: "acc-old" }, verified, {
        id: "acc-old",
        is_active: true,
        is_verified: true,
      }),
    ).toBe(false);
  });

  it("replaces a default that is no longer usable", () => {
    const vendor = { default_shipping_account_id: "acc-old" };
    expect(
      shouldBecomeDefaultAccount(vendor, verified, {
        id: "acc-old",
        is_active: false,
        is_verified: true,
      }),
    ).toBe(true);
    expect(shouldBecomeDefaultAccount(vendor, verified, null)).toBe(true);
    expect(
      shouldBecomeDefaultAccount(vendor, verified, {
        id: "acc-old",
        is_active: true,
        is_verified: true,
        deleted_at: new Date(),
      }),
    ).toBe(true);
  });

  it("never defaults to an inactive or unverified account", () => {
    const vendor = { default_shipping_account_id: null };
    expect(shouldBecomeDefaultAccount(vendor, { ...verified, is_active: false }, null)).toBe(false);
    expect(shouldBecomeDefaultAccount(vendor, { ...verified, is_verified: false }, null)).toBe(
      false,
    );
  });
});
