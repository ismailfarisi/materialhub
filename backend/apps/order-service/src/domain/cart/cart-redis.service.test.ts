// cart-redis.service.test.ts
import { beforeEach, describe, expect, it, mock } from "bun:test";
import { CartRedisService } from "./cart-redis.service.ts";

describe("CartRedisService", () => {
  const mockRedis = {
    hSet: mock(() => Promise.resolve(1)),
    hGetAll: mock(() => Promise.resolve({})),
    hDel: mock(() => Promise.resolve(1)),
    del: mock(() => Promise.resolve(1)),
    expire: mock(() => Promise.resolve(true)),
  };

  let service: CartRedisService;

  beforeEach(() => {
    Object.values(mockRedis).forEach((m) => m.mockClear());
    service = new CartRedisService(mockRedis as any);
  });

  it("sets a cart item as JSON in a hash field keyed by variantId||productId", async () => {
    await service.setItem("user-1", {
      productId: "p1",
      variantId: "v1",
      quantity: 2,
      unitPrice: 1000,
      vendorId: "vendor-1",
    });
    expect(mockRedis.hSet).toHaveBeenCalledWith("cart:user-1", "v1", expect.any(String));
    expect(mockRedis.expire).toHaveBeenCalledWith("cart:user-1", 2592000);
  });

  it("gets all items from hash", async () => {
    mockRedis.hGetAll.mockResolvedValueOnce({
      v1: JSON.stringify({
        productId: "p1",
        variantId: "v1",
        quantity: 2,
        unitPrice: 1000,
        vendorId: "vendor-1",
      }),
    });
    const items = await service.getItems("user-1");
    expect(items).toHaveLength(1);
    expect(items[0]!.productId).toBe("p1");
  });

  it("removes a single item", async () => {
    await service.removeItem("user-1", "v1");
    expect(mockRedis.hDel).toHaveBeenCalledWith("cart:user-1", "v1");
  });

  it("clears entire cart", async () => {
    await service.clear("user-1");
    expect(mockRedis.del).toHaveBeenCalledWith("cart:user-1");
  });
});
