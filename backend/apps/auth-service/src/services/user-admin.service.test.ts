import { describe, expect, test } from "bun:test";
import type { User } from "@materialhub/database";
import type { Repository } from "typeorm";
import { UserAdminService } from "./user-admin.service.ts";

function makeRepo(user: Partial<User> | null) {
  let lastSelect: Record<string, boolean> | undefined;
  const repo = {
    findOne: async ({ select }: any) => {
      lastSelect = select;
      return user;
    },
    getLastSelect: () => lastSelect,
  } as unknown as Repository<User> & { getLastSelect: () => Record<string, boolean> };
  return repo;
}

describe("UserAdminService.getById", () => {
  test("returns the full profile/wallet field set", async () => {
    const full: Partial<User> = {
      id: "u1",
      first_name: "Aya",
      last_name: "Noor",
      email: "aya@example.com",
      phone: "+971500000000",
      wallet_balance: 12345,
      wallet_currency: "AED",
    };
    const service = new UserAdminService(makeRepo(full) as any);
    const result = await service.getById("u1");
    expect(result.wallet_balance).toBe(12345);
    expect(result.phone).toBe("+971500000000");
  });

  test("select widens beyond the list projection (wallet + verification)", async () => {
    const repo = makeRepo({ id: "u1" } as any) as any;
    const service = new UserAdminService(repo);
    await service.getById("u1");
    const select = repo.getLastSelect();
    expect(select.wallet_balance).toBe(true);
    expect(select.wallet_currency).toBe(true);
    expect(select.phone).toBe(true);
    expect(select.email_verified_at).toBe(true);
    // secrets stay out
    expect(select.password_hash).toBeUndefined();
    expect(select.token_version).toBeUndefined();
  });

  test("throws 404 when user not found", async () => {
    const service = new UserAdminService(makeRepo(null) as any);
    await expect(service.getById("missing")).rejects.toThrow("User not found");
  });
});

describe("UserAdminService.list", () => {
  function makeListRepo() {
    let selectArgs: string[] = [];
    const andWhereCalls: Array<{ query: string; parameters?: any }> = [];

    const qb: any = {
      select: (args: string[]) => {
        selectArgs = args;
        return qb;
      },
      where: () => qb,
      andWhere: (query: string, parameters?: any) => {
        andWhereCalls.push({ query, parameters });
        return qb;
      },
      orderBy: () => qb,
      skip: () => qb,
      take: () => qb,
      getManyAndCount: async () => [[], 0],
    };

    return {
      createQueryBuilder: () => qb,
      getSelectArgs: () => selectArgs,
      getAndWhereCalls: () => andWhereCalls,
    } as unknown as Repository<User> & {
      getSelectArgs: () => string[];
      getAndWhereCalls: () => Array<{ query: string; parameters?: any }>;
    };
  }

  test("includes user.phone in select array", async () => {
    const repo = makeListRepo();
    const service = new UserAdminService(repo);
    await service.list({});
    expect(repo.getSelectArgs()).toContain("user.phone");
  });

  test("adds user.phone ILIKE :s to search clause when search query provided", async () => {
    const repo = makeListRepo();
    const service = new UserAdminService(repo);
    await service.list({ search: "+97150" });
    const searchCall = repo.getAndWhereCalls().find((call) => call.query.includes("ILIKE"));
    expect(searchCall).toBeDefined();
    expect(searchCall?.query).toContain("user.phone ILIKE :s");
  });
});
