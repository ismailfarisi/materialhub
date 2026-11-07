import { config } from "@materialhub/config";
import { type RedisClientType, createClient } from "redis";
import type { CategoryService } from "./category.service.ts";

const CACHE_KEY = "materialhub:product:categories:tree";

/** Locales the public tree is cached for; anything else is served the English tree. */
export const TREE_CACHE_LOCALES = ["en", "ar", "hi", "ml", "ur"] as const;
export type TreeCacheLocale = (typeof TREE_CACHE_LOCALES)[number];

/** One Redis entry per locale; English keeps the historical key. */
export function treeCacheKey(locale: TreeCacheLocale): string {
  return locale === "en" ? CACHE_KEY : `${CACHE_KEY}:${locale}`;
}

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

  async getTree(locale: TreeCacheLocale = "en"): Promise<any> {
    const key = treeCacheKey(locale);
    const redis = await this.getRedis();
    if (redis) {
      const cached = await redis.get(key);
      if (cached) return JSON.parse(cached);
    }

    const tree = await this.categoryService.getTree({ locale });

    if (redis) {
      await redis.set(key, JSON.stringify(tree), { EX: config.cache.categoryTreeTtl });
    }

    return tree;
  }

  async invalidate() {
    const redis = await this.getRedis();
    if (redis) await redis.del(TREE_CACHE_LOCALES.map(treeCacheKey));
  }
}
