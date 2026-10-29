// cart-redis.service.ts
import type { RedisClientType } from "redis";

const CART_TTL = 30 * 24 * 60 * 60; // 30 days in seconds

export interface CartRedisItem {
  productId: string;
  variantId: string | null;
  quantity: number;
  unitPrice: number;
  vendorId: string;
  originalUnitPrice?: number | null;
}

export class CartRedisService {
  constructor(private redis: RedisClientType) {}

  private key(ownerId: string): string {
    return `cart:${ownerId}`;
  }

  private fieldKey(item: { variantId: string | null; productId: string }): string {
    return item.variantId || item.productId;
  }

  async setItem(ownerId: string, item: CartRedisItem): Promise<void> {
    const key = this.key(ownerId);
    await this.redis.hSet(key, this.fieldKey(item), JSON.stringify(item));
    await this.redis.expire(key, CART_TTL);
  }

  async getItems(ownerId: string): Promise<CartRedisItem[]> {
    const data = await this.redis.hGetAll(this.key(ownerId));
    return Object.values(data).map((v) => JSON.parse(v as string));
  }

  async removeItem(ownerId: string, fieldKey: string): Promise<void> {
    await this.redis.hDel(this.key(ownerId), fieldKey);
  }

  async clear(ownerId: string): Promise<void> {
    await this.redis.del(this.key(ownerId));
  }
}
