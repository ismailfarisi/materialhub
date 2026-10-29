import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { AppDataSource, FlashDeal, Product, ProductVariant } from "@materialhub/database";
import { HttpError, NotFoundError } from "@materialhub/plugins";
import * as searchSync from "../search/search-sync.job.ts";
import { FlashDealService } from "./flash-deal.service.ts";

const VENDOR_A = "00000000-0000-0000-0000-00000000000a";
const VENDOR_B = "00000000-0000-0000-0000-00000000000b";
const PRODUCT_OF_A = "00000000-0000-0000-0000-0000000000a1";
const VARIANT_OF_A = "00000000-0000-0000-0000-0000000000a2";
const PRODUCT_OF_B = "00000000-0000-0000-0000-0000000000b1";
const VARIANT_OF_B = "00000000-0000-0000-0000-0000000000b2";
const UNKNOWN_PRODUCT = "00000000-0000-0000-0000-000000000000";

function makePayload(overrides: Record<string, unknown> = {}) {
  return {
    product_id: PRODUCT_OF_A,
    title: "fd-test",
    deal_price: 7500,
    original_price: 10000,
    starts_at: new Date(Date.now() + 60_000).toISOString(),
    expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    ...overrides,
  };
}

describe("FlashDealService.create — vendor derivation", () => {
  const service = new FlashDealService();
  let getRepoSpy: ReturnType<typeof spyOn>;
  let searchSyncSpy: ReturnType<typeof spyOn>;
  // biome-ignore lint/suspicious/noExplicitAny: test helper accumulator
  let savedDeal: any = null;

  beforeEach(() => {
    savedDeal = null;
    searchSyncSpy = spyOn(searchSync, "enqueueSearchSync").mockImplementation(async () => {});

    const productRepo = {
      findOne: ({ where }: { where: { id: string } }) => {
        if (where.id === PRODUCT_OF_A) {
          return Promise.resolve({ id: PRODUCT_OF_A, vendor_id: VENDOR_A });
        }
        if (where.id === PRODUCT_OF_B) {
          return Promise.resolve({ id: PRODUCT_OF_B, vendor_id: VENDOR_B });
        }
        return Promise.resolve(null);
      },
    };

    const variantRepo = {
      findOne: ({ where }: { where: { id: string } }) => {
        if (where.id === VARIANT_OF_A) {
          return Promise.resolve({
            id: VARIANT_OF_A,
            product_id: PRODUCT_OF_A,
          });
        }
        if (where.id === VARIANT_OF_B) {
          return Promise.resolve({
            id: VARIANT_OF_B,
            product_id: PRODUCT_OF_B,
          });
        }
        return Promise.resolve(null);
      },
    };

    const flashDealRepo = {
      // biome-ignore lint/suspicious/noExplicitAny: stub — real repo is typed
      create: (entity: any) => entity,
      // biome-ignore lint/suspicious/noExplicitAny: stub — real repo is typed
      save: (entity: any) => {
        savedDeal = { id: "deal-id-1", ...entity };
        return Promise.resolve(savedDeal);
      },
      createQueryBuilder: () => {
        // biome-ignore lint/suspicious/noExplicitAny: stub query builder
        const qb: any = {
          where: () => qb,
          andWhere: () => qb,
          getOne: () => Promise.resolve(null),
        };
        return qb;
      },
    };

    getRepoSpy = spyOn(AppDataSource, "getRepository").mockImplementation(
      // biome-ignore lint/suspicious/noExplicitAny: entity constructor type not exported by TypeORM
      (entity: any) => {
        // biome-ignore lint/suspicious/noExplicitAny: stub cast
        if (entity === Product) return productRepo as any;
        // biome-ignore lint/suspicious/noExplicitAny: stub cast
        if (entity === ProductVariant) return variantRepo as any;
        // biome-ignore lint/suspicious/noExplicitAny: stub cast
        if (entity === FlashDeal) return flashDealRepo as any;
        throw new Error(`Unmocked repo: ${String(entity)}`);
      },
    );
  });

  afterEach(() => {
    getRepoSpy?.mockRestore();
    searchSyncSpy?.mockRestore();
  });

  test("admin: omits vendor_id — service derives from product", async () => {
    const deal = await service.create(makePayload());
    expect(deal.vendor_id).toBe(VENDOR_A);
  });

  test("admin: passes matching vendor_id — accepted", async () => {
    const deal = await service.create(makePayload({ vendor_id: VENDOR_A }));
    expect(deal.vendor_id).toBe(VENDOR_A);
  });

  test("admin: passes mismatched vendor_id — rejected with HttpError", async () => {
    await expect(service.create(makePayload({ vendor_id: VENDOR_B }))).rejects.toThrow(HttpError);
  });

  test("variant_id from a different product — rejected", async () => {
    await expect(service.create(makePayload({ variant_id: VARIANT_OF_B }))).rejects.toThrow(
      HttpError,
    );
  });

  test("variant_id from same product — accepted", async () => {
    const deal = await service.create(makePayload({ variant_id: VARIANT_OF_A }));
    expect(deal.vendor_id).toBe(VENDOR_A);
    expect(deal.variant_id).toBe(VARIANT_OF_A);
  });

  test("unknown product_id — throws NotFoundError", async () => {
    await expect(service.create(makePayload({ product_id: UNKNOWN_PRODUCT }))).rejects.toThrow(
      NotFoundError,
    );
  });

  test("derived vendor_id wins even when caller omits it", async () => {
    const _deal = await service.create(makePayload());
    // Sanity: the saved entity carries the derived vendor, never undefined
    expect(savedDeal.vendor_id).toBe(VENDOR_A);
  });

  test("deal_price >= original_price — rejected with HttpError INVALID_PRICE", async () => {
    await expect(
      service.create(makePayload({ deal_price: 10000, original_price: 10000 })),
    ).rejects.toThrow(HttpError);
    await expect(
      service.create(makePayload({ deal_price: 11000, original_price: 10000 })),
    ).rejects.toThrow(HttpError);
  });
});

describe("FlashDealService.listActivePublic", () => {
  const service = new FlashDealService();
  let getRepoSpy: ReturnType<typeof spyOn>;

  afterEach(() => {
    getRepoSpy?.mockRestore();
  });

  test("returns active public flash deals with product card fields", async () => {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const deal = {
      id: "deal-1",
      deal_price: 7500,
      original_price: 10000,
      quantity_limit: 12,
      quantity_sold: 4,
      expires_at: new Date("2026-07-01T08:00:00Z"),
      product: {
        id: "product-1",
        name: "Glow Serum",
        slug: "glow-serum",
        price: 10000,
        vendor: { display_name: "Noor Vendor" },
        images: [
          {
            medium_url: "https://cdn.example.com/medium.webp",
            card_url: "https://cdn.example.com/card.webp",
            thumbnail_url: "https://cdn.example.com/thumb.webp",
            url: "https://cdn.example.com/original.webp",
          },
        ],
      },
    };
    // biome-ignore lint/suspicious/noExplicitAny: query-builder test double is intentionally chainable
    const qb: any = {
      leftJoinAndSelect: (...args: unknown[]) => {
        calls.push({ method: "leftJoinAndSelect", args });
        return qb;
      },
      leftJoin: (...args: unknown[]) => {
        calls.push({ method: "leftJoin", args });
        return qb;
      },
      where: (...args: unknown[]) => {
        calls.push({ method: "where", args });
        return qb;
      },
      andWhere: (...args: unknown[]) => {
        calls.push({ method: "andWhere", args });
        return qb;
      },
      orderBy: (...args: unknown[]) => {
        calls.push({ method: "orderBy", args });
        return qb;
      },
      take: (...args: unknown[]) => {
        calls.push({ method: "take", args });
        return qb;
      },
      getMany: () => Promise.resolve([deal]),
    };
    const flashDealRepo = {
      createQueryBuilder: () => qb,
    };

    getRepoSpy = spyOn(AppDataSource, "getRepository").mockImplementation(
      // biome-ignore lint/suspicious/noExplicitAny: entity constructor type not exported by TypeORM
      (entity: any) => {
        // biome-ignore lint/suspicious/noExplicitAny: stub cast
        if (entity === FlashDeal) return flashDealRepo as any;
        throw new Error(`Unmocked repo: ${String(entity)}`);
      },
    );

    const result = await service.listActivePublic({
      limit: 6,
      vendor_id: VENDOR_A,
      category: "skincare",
    });

    expect(result).toEqual([
      {
        id: "deal-1",
        deal_price: 7500,
        original_price: 10000,
        quantity_limit: 12,
        quantity_sold: 4,
        expires_at: "2026-07-01T08:00:00.000Z",
        product: {
          id: "product-1",
          title: "Glow Serum",
          slug: "glow-serum",
          price: 10000,
          image_url: "https://cdn.example.com/medium.webp",
          vendor_name: "Noor Vendor",
        },
      },
    ]);
    expect(calls).toContainEqual({
      method: "andWhere",
      args: ["fd.vendor_id = :vendorId", { vendorId: VENDOR_A }],
    });
    expect(calls).toContainEqual({
      method: "andWhere",
      args: ["category.slug = :category", { category: "skincare" }],
    });
    expect(calls).toContainEqual({ method: "take", args: [6] });
  });
});
