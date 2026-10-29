import { describe, expect, it, mock } from "bun:test";
import { CartService } from "./cart.service.ts";

function makeRepo(overrides: Record<string, unknown> = {}) {
  return { update: mock(async () => ({ affected: 1 })), ...overrides } as any;
}

describe("CartService.setAffiliateCode", () => {
  it("persists the affiliate code onto the cart row", async () => {
    const cartRepo = makeRepo();
    const svc = new CartService(
      cartRepo,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    await svc.setAffiliateCode("cart-1", "AFF-ABC12345");
    expect(cartRepo.update).toHaveBeenCalledWith(
      { id: "cart-1" },
      { affiliate_code: "AFF-ABC12345" },
    );
  });

  it("clears the code when passed null", async () => {
    const cartRepo = makeRepo();
    const svc = new CartService(
      cartRepo,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    await svc.setAffiliateCode("cart-1", null);
    expect(cartRepo.update).toHaveBeenCalledWith({ id: "cart-1" }, { affiliate_code: null });
  });
});
