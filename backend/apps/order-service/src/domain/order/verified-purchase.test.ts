import { describe, expect, it } from "bun:test";
import { VerifiedPurchaseService } from "./verified-purchase.service.ts";

function makeQueryBuilder(count: number) {
  return {
    innerJoin: function () {
      return this;
    },
    where: function () {
      return this;
    },
    andWhere: function () {
      return this;
    },
    getCount: async () => count,
  };
}

describe("VerifiedPurchaseService.hasVerifiedPurchase", () => {
  it("returns true when user has a delivered order containing the product", async () => {
    const fakeRepo = { createQueryBuilder: () => makeQueryBuilder(1) };
    const service = new VerifiedPurchaseService(fakeRepo as any);
    expect(await service.hasVerifiedPurchase("user-1", "product-1")).toBe(true);
  });

  it("returns false when no delivered order matches", async () => {
    const fakeRepo = { createQueryBuilder: () => makeQueryBuilder(0) };
    const service = new VerifiedPurchaseService(fakeRepo as any);
    expect(await service.hasVerifiedPurchase("user-1", "product-1")).toBe(false);
  });
});

describe("VerifiedPurchaseService.listDeliveredItems", () => {
  function makeDeliveredItemsQB(rows: any[]) {
    const qb: any = {
      innerJoin: () => qb,
      leftJoin: () => qb,
      select: () => qb,
      where: () => qb,
      andWhere: () => qb,
      orderBy: () => qb,
      addOrderBy: () => qb,
      limit: () => qb,
      setParameters: () => qb,
      getRawMany: async () => rows,
    };
    return qb;
  }

  it("returns [] when the user has no delivered items", async () => {
    const fakeRepo = { createQueryBuilder: () => makeDeliveredItemsQB([]) };
    const service = new VerifiedPurchaseService(fakeRepo as any);
    const out = await service.listDeliveredItems({ userId: "u1", q: null, limit: 20 });
    expect(out).toEqual([]);
  });

  it("maps raw rows to DeliveredItemRow (Date → ISO, null coercion)", async () => {
    const raw = [
      {
        product_id: "p1",
        name: "Gold-plated hoops",
        thumbnail_url: "https://img/p1.jpg",
        variant_label: "Medium / Gold",
        delivered_at: new Date("2026-04-03T10:22:00Z"),
      },
      {
        product_id: "p2",
        name: "Silver ring",
        thumbnail_url: null,
        variant_label: null,
        delivered_at: new Date("2026-03-29T08:00:00Z"),
      },
    ];
    const fakeRepo = { createQueryBuilder: () => makeDeliveredItemsQB(raw) };
    const service = new VerifiedPurchaseService(fakeRepo as any);
    const out = await service.listDeliveredItems({ userId: "u1", q: null, limit: 20 });
    expect(out).toEqual([
      {
        product_id: "p1",
        name: "Gold-plated hoops",
        thumbnail_url: "https://img/p1.jpg",
        variant_label: "Medium / Gold",
        delivered_at: "2026-04-03T10:22:00.000Z",
      },
      {
        product_id: "p2",
        name: "Silver ring",
        thumbnail_url: null,
        variant_label: null,
        delivered_at: "2026-03-29T08:00:00.000Z",
      },
    ]);
  });

  it("applies ILIKE %q% filter only when q is non-empty", async () => {
    const andWhereCalls: Array<{ sql: string; params?: Record<string, unknown> }> = [];
    function makeSpyQB() {
      const qb: any = {
        innerJoin: () => qb,
        leftJoin: () => qb,
        select: () => qb,
        where: () => qb,
        andWhere: (sql: string, params?: Record<string, unknown>) => {
          andWhereCalls.push({ sql, params });
          return qb;
        },
        orderBy: () => qb,
        addOrderBy: () => qb,
        limit: () => qb,
        setParameters: () => qb,
        getRawMany: async () => [],
      };
      return qb;
    }
    const fakeRepo = { createQueryBuilder: () => makeSpyQB() };
    const service = new VerifiedPurchaseService(fakeRepo as any);

    await service.listDeliveredItems({ userId: "u1", q: "hoops", limit: 20 });
    const ilikeWithQ = andWhereCalls.find(
      (c) => typeof c.sql === "string" && c.sql.includes("ILIKE"),
    );
    expect(ilikeWithQ).toBeDefined();
    expect(ilikeWithQ!.params).toEqual({ qLike: "%hoops%" });

    andWhereCalls.length = 0;
    await service.listDeliveredItems({ userId: "u1", q: null, limit: 20 });
    const ilikeWithNull = andWhereCalls.find(
      (c) => typeof c.sql === "string" && c.sql.includes("ILIKE"),
    );
    expect(ilikeWithNull).toBeUndefined();

    andWhereCalls.length = 0;
    await service.listDeliveredItems({ userId: "u1", q: "   ", limit: 20 });
    const ilikeWithWhitespace = andWhereCalls.find(
      (c) => typeof c.sql === "string" && c.sql.includes("ILIKE"),
    );
    expect(ilikeWithWhitespace).toBeUndefined();
  });

  it("clamps limit to [1, 50]", async () => {
    const limitCalls: number[] = [];
    function makeLimitSpyQB() {
      const qb: any = {
        innerJoin: () => qb,
        leftJoin: () => qb,
        select: () => qb,
        where: () => qb,
        andWhere: () => qb,
        orderBy: () => qb,
        addOrderBy: () => qb,
        limit: (n: number) => {
          limitCalls.push(n);
          return qb;
        },
        setParameters: () => qb,
        getRawMany: async () => [],
      };
      return qb;
    }
    const fakeRepo = { createQueryBuilder: () => makeLimitSpyQB() };
    const service = new VerifiedPurchaseService(fakeRepo as any);

    await service.listDeliveredItems({ userId: "u1", q: null, limit: 0 });
    await service.listDeliveredItems({ userId: "u1", q: null, limit: -5 });
    await service.listDeliveredItems({ userId: "u1", q: null, limit: 999 });
    await service.listDeliveredItems({ userId: "u1", q: null, limit: 20 });

    expect(limitCalls).toEqual([1, 1, 50, 20]);
  });
});
