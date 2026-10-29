import { config } from "@materialhub/config";
import { type RedisClientType, createClient } from "redis";
import type { CategoryService } from "./category.service.ts";

const CACHE_KEY = "materialhub:product:categories:tree";

export class CategoryCacheService {
  private redis: RedisClientType | null = null;
  private readonly categoryService: CategoryService;

  constructor(categoryService: CategoryService) {
    this.categoryService = categoryService;
  }

  private async getRedis(): Promise<RedisClientType | null> {
    if (this.redis?.isOpen) return this.redis;
    try {
      this.redis = createClient({
        socket: {
          host: config.redis.host,
          port: config.redis.port,
          connectTimeout: 2000,
        },
        password: config.redis.password,
      });
      await this.redis.connect();
      return this.redis;
    } catch {
      this.redis = null;
      return null;
    }
  }

  async getTree(): Promise<any> {
    const redis = await this.getRedis();
    if (redis) {
      const cached = await redis.get(CACHE_KEY);
      if (cached) return JSON.parse(cached);
    }

    const tree = await this.categoryService.getTree();

    if (redis) {
      await redis.set(CACHE_KEY, JSON.stringify(tree), { EX: config.cache.categoryTreeTtl });
    }

    return tree;
  }

  async invalidate() {
    const redis = await this.getRedis();
    if (redis) await redis.del(CACHE_KEY);
  }
}
