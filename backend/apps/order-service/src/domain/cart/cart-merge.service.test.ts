// cart-merge.service.test.ts
import { beforeEach, describe, expect, it, mock } from "bun:test";
import { CartMergeService } from "./cart-merge.service.ts";

describe("CartMergeService", () => {
  const mockCartRepo = {
    findOne: mock(() => Promise.resolve(null)),
    save: mock((c: any) => Promise.resolve(c)),
    softRemove: mock(() => Promise.resolve()),
  };
  const mockCartItemRepo = {
    find: mock(() => Promise.resolve([])),
    findOne: mock(() => Promise.resolve(null)),
    save: mock((item: any) => Promise.resolve(item)),
    softRemove: mock(() => Promise.resolve()),
  };
  const mockRedis = {
    getItems: mock(() => Promise.resolve([])),
    setItem: mock(() => Promise.resolve()),
    clear: mock(() => Promise.resolve()),
  };

  let service: CartMergeService;

  beforeEach(() => {
    Object.values(mockCartRepo).forEach((m) => m.mockClear());
    Object.values(mockCartItemRepo).forEach((m) => m.mockClear());
    Object.values(mockRedis).forEach((m) => m.mockClear());
    service = new CartMergeService(mockCartRepo as any, mockCartItemRepo as any, mockRedis as any);
  });

  it("keeps higher quantity on conflict", async () => {
    // Guest has product with qty 3, user has same product with qty 1
    const guestCart = { id: "gc", guest_session_id: "gs1", user_id: null };
    const userCart = { id: "uc", user_id: "u1", guest_session_id: null };
    mockCartRepo.findOne
      .mockResolvedValueOnce(guestCart as any) // guest lookup
      .mockResolvedValueOnce(userCart as any); // user lookup

    const guestItems = [
      {
        id: "gi1",
        cart_id: "gc",
        product_id: "p1",
        variant_id: "v1",
        quantity: 3,
        unit_price: 1000,
        line_total: 3000,
        vendor_id: "vr1",
      },
    ];
    const userItems = [
      {
        id: "ui1",
        cart_id: "uc",
        product_id: "p1",
        variant_id: "v1",
        quantity: 1,
        unit_price: 1000,
        line_total: 1000,
        vendor_id: "vr1",
      },
    ];
    mockCartItemRepo.find
      .mockResolvedValueOnce(guestItems as any)
      .mockResolvedValueOnce(userItems as any);

    await service.mergeGuestToUser("gs1", "u1");

    // User item should be updated to qty 3 (higher wins)
    expect(mockCartItemRepo.save).toHaveBeenCalledWith(expect.objectContaining({ quantity: 3 }));
    // Guest cart should be soft-removed
    expect(mockCartRepo.softRemove).toHaveBeenCalled();
  });

  it("does nothing when no guest cart exists", async () => {
    mockCartRepo.findOne.mockResolvedValueOnce(null);
    await service.mergeGuestToUser("gs1", "u1");
    expect(mockCartItemRepo.save).not.toHaveBeenCalled();
  });
});
