// cart.service.test.ts
import { beforeEach, describe, expect, it, mock } from "bun:test";
import { CartService } from "./cart.service.ts";

describe("CartService", () => {
  const mockCartRepo = {
    findOne: mock((_args?: any): Promise<any> => Promise.resolve(null)),
    save: mock((c: any) => Promise.resolve({ id: "cart-1", ...c })),
    softRemove: mock(() => Promise.resolve()),
  };
  const mockCartItemRepo = {
    findOne: mock((_args?: any): Promise<any> => Promise.resolve(null)),
    save: mock((item: any) => Promise.resolve({ id: "item-1", ...item })),
    softRemove: mock(() => Promise.resolve()),
    find: mock(() => Promise.resolve([])),
    create: mock((item: any) => item),
  };
  const mockInventoryRepo = {
    findOne: mock(
      (_args?: any): Promise<any> =>
        Promise.resolve({ quantity_on_hand: 100, quantity_reserved: 0 }),
    ),
  };
  const mockProductRepo = {
    findOne: mock(
      (_args?: any): Promise<any> =>
        Promise.resolve({ id: "p1", price: 5000, name: "Test", vendor_id: "v1" }),
    ),
  };
  const mockRedis = {
    setItem: mock(() => Promise.resolve()),
    getItems: mock(() => Promise.resolve([])),
    removeItem: mock(() => Promise.resolve()),
    clear: mock(() => Promise.resolve()),
  };
  const mockGiftBoxRepo = {
    find: mock(() => Promise.resolve([])),
    findOne: mock((_args?: any): Promise<any> => Promise.resolve(null)),
    save: mock((row: any) => Promise.resolve({ id: "gb-1", ...row })),
    softRemove: mock(() => Promise.resolve()),
    create: mock((row: any) => row),
  };
  const mockGiftBoxResolver = {
    resolve: mock(() => Promise.resolve({} as any)),
  };

  let service: CartService;

  beforeEach(() => {
    Object.values(mockCartRepo).forEach((m) => m.mockClear());
    Object.values(mockCartItemRepo).forEach((m) => m.mockClear());
    Object.values(mockInventoryRepo).forEach((m) => m.mockClear());
    Object.values(mockProductRepo).forEach((m) => m.mockClear());
    Object.values(mockRedis).forEach((m) => m.mockClear());
    Object.values(mockGiftBoxRepo).forEach((m) => m.mockClear());
    Object.values(mockGiftBoxResolver).forEach((m) => m.mockClear());
    service = new CartService(
      mockCartRepo as any,
      mockCartItemRepo as any,
      mockInventoryRepo as any,
      mockProductRepo as any,
      {} as any, // variantRepo
      mockRedis as any,
      {
        resolveForLine: async () => null,
        validateAndIncrement: async () => {},
        decrement: async () => {},
      } as any,
      mockGiftBoxRepo as any,
      mockGiftBoxResolver as any,
    );
  });

  it("creates a new cart when user has none", async () => {
    mockCartRepo.findOne.mockResolvedValueOnce(null);
    const _cart = await service.getOrCreateCart("user-1", null);
    expect(mockCartRepo.save).toHaveBeenCalled();
  });

  // Regression: with neither a user nor a guest session, the owner filter used
  // to collapse to `{ guest_session_id: null }`, which TypeORM drops — the
  // query degenerated to "any cart" and served a stranger's cart. Never query.
  it("refuses to resolve a cart with no owner identity", async () => {
    await expect(service.getOrCreateCart(null, null)).rejects.toThrow();
    expect(mockCartRepo.findOne).not.toHaveBeenCalled();
    expect(mockCartRepo.save).not.toHaveBeenCalled();
  });

  it("returns an empty cart view for an unidentified caller instead of someone else's", async () => {
    const result = await service.getCart(null, null);
    expect(result.items).toEqual([]);
    expect(result.cart).toBeNull();
    expect(mockCartRepo.findOne).not.toHaveBeenCalled();
  });

  it("adds item with stock validation", async () => {
    mockCartRepo.findOne.mockResolvedValueOnce({ id: "cart-1", user_id: "user-1" });
    mockProductRepo.findOne.mockResolvedValueOnce({
      id: "p1",
      price: 5000,
      name: "Test",
      vendor_id: "v1",
      status: "published",
    });
    mockInventoryRepo.findOne.mockResolvedValueOnce({ quantity_on_hand: 10, quantity_reserved: 0 });
    mockCartItemRepo.findOne.mockResolvedValueOnce(null);

    await service.addItem("user-1", null, { productId: "p1", variantId: null, quantity: 2 });
    expect(mockCartItemRepo.save).toHaveBeenCalled();
    expect(mockRedis.setItem).toHaveBeenCalled();
  });

  it("rejects add when insufficient stock", async () => {
    mockCartRepo.findOne.mockResolvedValueOnce({ id: "cart-1", user_id: "user-1" });
    mockProductRepo.findOne.mockResolvedValueOnce({
      id: "p1",
      price: 5000,
      name: "Test",
      vendor_id: "v1",
      status: "published",
    });
    mockInventoryRepo.findOne.mockResolvedValueOnce({ quantity_on_hand: 1, quantity_reserved: 1 });
    // Note: cartItemRepo.findOne is NOT called when stock check fails - no mock needed

    await expect(
      service.addItem("user-1", null, { productId: "p1", variantId: null, quantity: 5 }),
    ).rejects.toThrow();
  });

  it("updates quantity — 0 removes item", async () => {
    mockCartRepo.findOne.mockResolvedValueOnce({ id: "cart-1", user_id: "user-1" });
    mockCartItemRepo.findOne.mockResolvedValueOnce({
      id: "item-1",
      cart_id: "cart-1",
      product_id: "p1",
      variant_id: "v1",
      quantity: 2,
    });
    await service.updateItemQuantity("user-1", null, "v1", 0);
    expect(mockCartItemRepo.softRemove).toHaveBeenCalled();
    expect(mockRedis.removeItem).toHaveBeenCalled();
  });

  it("getCart snaps back unit_price and emits deal_ended when deal expired", async () => {
    // A cart item carrying a flash_deal_id whose live deal no longer resolves.
    const expiredDealId = "00000000-0000-0000-0000-000000000d01";
    const item = {
      id: "item-deal-1",
      cart_id: "cart-1",
      product_id: "p1",
      variant_id: null,
      vendor_id: "v1",
      quantity: 1,
      unit_price: 7500,
      original_unit_price: 10000,
      flash_deal_id: expiredDealId,
      line_total: 7500,
      product: { id: "p1", price: 10000, name: "Test", images: [] },
      variant: null,
      vendor: { id: "v1", name: "Vendor One" },
    };

    mockCartRepo.findOne
      .mockResolvedValueOnce({ id: "cart-1", user_id: "user-1" }) // getOrCreateCart
      .mockResolvedValueOnce({ id: "cart-1", user_id: "user-1", subtotal: 10000, item_count: 1 }); // refresh after recalc
    mockCartItemRepo.find.mockResolvedValueOnce([item] as any);
    // recalcCartTotals re-reads items
    mockCartItemRepo.find.mockResolvedValueOnce([item] as any);

    // Override the stub for THIS test — flashDealApplicator.resolveForLine returns null (deal ended)
    const dealEndedService = new CartService(
      mockCartRepo as any,
      mockCartItemRepo as any,
      mockInventoryRepo as any,
      mockProductRepo as any,
      {} as any,
      mockRedis as any,
      {
        resolveForLine: async () => null,
        validateAndIncrement: async () => {},
        decrement: async () => {},
      } as any,
      mockGiftBoxRepo as any,
      mockGiftBoxResolver as any,
    );

    const result = await dealEndedService.getCart("user-1", null);

    expect(result.notifications).toHaveLength(1);
    expect(result.notifications[0]?.type).toBe("deal_ended");
    expect(result.notifications[0]?.was).toBe(7500);
    expect(result.notifications[0]?.now).toBe(10000);
    expect(item.unit_price).toBe(10000);
    expect(item.flash_deal_id).toBeNull();
    expect(item.line_total).toBe(10000);
    expect(mockCartItemRepo.save).toHaveBeenCalledWith([item]);
  });
});
