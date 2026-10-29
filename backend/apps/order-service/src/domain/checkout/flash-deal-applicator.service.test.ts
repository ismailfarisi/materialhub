import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { AppDataSource } from "@materialhub/database";
import { HttpError } from "@materialhub/plugins";
import { DealSoldOutError, FlashDealApplicator } from "./flash-deal-applicator.service.ts";

const PRODUCT_A = "00000000-0000-0000-0000-0000000000a1";
const VARIANT_A = "00000000-0000-0000-0000-0000000000a2";
const DEAL_ID = "00000000-0000-0000-0000-000000000d01";

function makeQb(rows: any[]) {
  const qb: any = {
    select: () => qb,
    from: () => qb,
    where: () => qb,
    andWhere: () => qb,
    orderBy: () => qb,
    addOrderBy: () => qb,
    limit: () => qb,
    setLock: () => qb,
    setParameters: () => qb,
    setParameter: () => qb,
    getRawOne: () => Promise.resolve(rows[0] ?? undefined),
    execute: () => Promise.resolve({ raw: [], affected: 1 }),
  };
  return qb;
}

describe("FlashDealApplicator.resolveForLine", () => {
  let createQbSpy: ReturnType<typeof spyOn>;

  afterEach(() => {
    createQbSpy?.mockRestore();
  });

  test("returns null when no active deal", async () => {
    createQbSpy = spyOn(AppDataSource, "createQueryBuilder").mockReturnValue(makeQb([]) as any);
    const applicator = new FlashDealApplicator(AppDataSource);
    const result = await applicator.resolveForLine(PRODUCT_A, null);
    expect(result).toBeNull();
  });

  test("returns deal when active", async () => {
    createQbSpy = spyOn(AppDataSource, "createQueryBuilder").mockReturnValue(
      makeQb([{ id: DEAL_ID, deal_price: 7500, original_price: 10000 }]) as any,
    );
    const applicator = new FlashDealApplicator(AppDataSource);
    const result = await applicator.resolveForLine(PRODUCT_A, VARIANT_A);
    expect(result).toEqual({
      flashDealId: DEAL_ID,
      dealPrice: 7500,
      originalPrice: 10000,
    });
  });
});

describe("FlashDealApplicator.validateAndIncrement", () => {
  test("increments quantity_sold when cap not reached", async () => {
    const updates: any[] = [];
    const manager = {
      createQueryBuilder: () => {
        const qb: any = {
          select: () => qb,
          from: () => qb,
          where: () => qb,
          setLock: () => qb,
          setParameters: () => qb,
          getRawOne: () =>
            Promise.resolve({
              id: DEAL_ID,
              quantity_limit: 100,
              quantity_sold: 50,
              is_active: true,
              starts_at: new Date(Date.now() - 60_000),
              expires_at: new Date(Date.now() + 60_000),
              deleted_at: null,
            }),
          update: (_entity: any) => {
            const sub: any = {
              set: (s: any) => {
                updates.push(s);
                return sub;
              },
              where: () => sub,
              setParameter: () => sub,
              execute: () => Promise.resolve({ affected: 1 }),
            };
            return sub;
          },
        };
        return qb;
      },
    };
    const applicator = new FlashDealApplicator(AppDataSource);
    await applicator.validateAndIncrement(manager as any, DEAL_ID, 5);
    expect(updates.length).toBe(1);
  });

  test("throws DealSoldOutError when cap would be exceeded", async () => {
    const manager = {
      createQueryBuilder: () => ({
        select: function () {
          return this;
        },
        from: function () {
          return this;
        },
        where: function () {
          return this;
        },
        setLock: function () {
          return this;
        },
        setParameters: function () {
          return this;
        },
        getRawOne: () =>
          Promise.resolve({
            id: DEAL_ID,
            quantity_limit: 100,
            quantity_sold: 99,
            is_active: true,
            starts_at: new Date(Date.now() - 60_000),
            expires_at: new Date(Date.now() + 60_000),
            deleted_at: null,
          }),
      }),
    };
    const applicator = new FlashDealApplicator(AppDataSource);
    await expect(applicator.validateAndIncrement(manager as any, DEAL_ID, 5)).rejects.toThrow(
      DealSoldOutError,
    );
  });

  test("throws when deal flipped inactive", async () => {
    const manager = {
      createQueryBuilder: () => ({
        select: function () {
          return this;
        },
        from: function () {
          return this;
        },
        where: function () {
          return this;
        },
        setLock: function () {
          return this;
        },
        setParameters: function () {
          return this;
        },
        getRawOne: () =>
          Promise.resolve({
            id: DEAL_ID,
            quantity_limit: null,
            quantity_sold: 0,
            is_active: false,
            starts_at: new Date(Date.now() - 60_000),
            expires_at: new Date(Date.now() + 60_000),
            deleted_at: null,
          }),
      }),
    };
    const applicator = new FlashDealApplicator(AppDataSource);
    await expect(applicator.validateAndIncrement(manager as any, DEAL_ID, 1)).rejects.toThrow(
      DealSoldOutError,
    );
  });

  test("throws when deal expired", async () => {
    const manager = {
      createQueryBuilder: () => ({
        select: function () {
          return this;
        },
        from: function () {
          return this;
        },
        where: function () {
          return this;
        },
        setLock: function () {
          return this;
        },
        setParameters: function () {
          return this;
        },
        getRawOne: () =>
          Promise.resolve({
            id: DEAL_ID,
            quantity_limit: null,
            quantity_sold: 0,
            is_active: true,
            starts_at: new Date(Date.now() - 120_000),
            expires_at: new Date(Date.now() - 60_000),
            deleted_at: null,
          }),
      }),
    };
    const applicator = new FlashDealApplicator(AppDataSource);
    await expect(applicator.validateAndIncrement(manager as any, DEAL_ID, 1)).rejects.toThrow(
      DealSoldOutError,
    );
  });

  test("throws when deal soft-deleted", async () => {
    const manager = {
      createQueryBuilder: () => ({
        select: function () {
          return this;
        },
        from: function () {
          return this;
        },
        where: function () {
          return this;
        },
        setLock: function () {
          return this;
        },
        setParameters: function () {
          return this;
        },
        getRawOne: () =>
          Promise.resolve({
            id: DEAL_ID,
            quantity_limit: null,
            quantity_sold: 0,
            is_active: true,
            starts_at: new Date(Date.now() - 60_000),
            expires_at: new Date(Date.now() + 60_000),
            deleted_at: new Date(),
          }),
      }),
    };
    const applicator = new FlashDealApplicator(AppDataSource);
    await expect(applicator.validateAndIncrement(manager as any, DEAL_ID, 1)).rejects.toThrow(
      DealSoldOutError,
    );
  });

  test("throws when deal row missing", async () => {
    const manager = {
      createQueryBuilder: () => ({
        select: function () {
          return this;
        },
        from: function () {
          return this;
        },
        where: function () {
          return this;
        },
        setLock: function () {
          return this;
        },
        setParameters: function () {
          return this;
        },
        getRawOne: () => Promise.resolve(undefined),
      }),
    };
    const applicator = new FlashDealApplicator(AppDataSource);
    await expect(applicator.validateAndIncrement(manager as any, DEAL_ID, 1)).rejects.toThrow(
      DealSoldOutError,
    );
  });
});

describe("FlashDealApplicator.decrement", () => {
  test("issues UPDATE with GREATEST floor", async () => {
    let executed = false;
    const manager = {
      createQueryBuilder: () => ({
        update: () => ({
          set: function () {
            return this;
          },
          where: function () {
            return this;
          },
          setParameter: function () {
            return this;
          },
          execute: () => {
            executed = true;
            return Promise.resolve({ affected: 1 });
          },
        }),
      }),
    };
    const applicator = new FlashDealApplicator(AppDataSource);
    await applicator.decrement(manager as any, DEAL_ID, 3);
    expect(executed).toBe(true);
  });

  test("no-ops on zero qty", async () => {
    const manager = {
      createQueryBuilder: () => {
        throw new Error("should not be called for qty=0");
      },
    };
    const applicator = new FlashDealApplicator(AppDataSource);
    await applicator.decrement(manager as any, DEAL_ID, 0);
  });
});

test("DealSoldOutError extends HttpError with code DEAL_SOLD_OUT", () => {
  const err = new DealSoldOutError(DEAL_ID);
  expect(err).toBeInstanceOf(HttpError);
  expect(err.statusCode).toBe(409);
  expect(err.code).toBe("DEAL_SOLD_OUT");
});
