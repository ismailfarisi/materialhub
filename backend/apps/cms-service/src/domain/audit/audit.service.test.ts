import { describe, expect, test } from "bun:test";
import { AuditService, actionFilterSql, attachActors, parseAuditDate } from "./audit.service.ts";

describe("audit log filters", () => {
  test("a bare verb matches that verb on any entity", () => {
    const f = actionFilterSql("create");
    expect(f.params).toEqual({
      actionExact: "create",
      actionVerb: "%.create",
      actionVerbVariant: "%.create\\_%",
    });
  });

  test("a dotted action is a prefix", () => {
    expect(actionFilterSql("categories.").params).toEqual({ actionPrefix: "categories.%" });
  });

  test("date inputs become UAE day bounds; garbage is a 400", () => {
    expect(parseAuditDate("2026-11-07").toISOString()).toBe("2026-11-06T20:00:00.000Z");
    expect(parseAuditDate("2026-11-07", true).toISOString()).toBe("2026-11-07T19:59:59.999Z");
    expect(parseAuditDate("2026-11-07T10:00:00Z").toISOString()).toBe("2026-11-07T10:00:00.000Z");
    expect(() => parseAuditDate("yesterday")).toThrow();
  });
});

describe("AuditService.list", () => {
  test("joins the actor's name and email onto each row", async () => {
    const actor = { id: "u1", email: "ops@materialhub.test", first_name: "Ops", last_name: "Lead" };
    const rows = [
      { id: "r1", actor_id: "u1", action: "categories.create" },
      { id: "r2", actor_id: null, action: "orders.auto_cancel" },
    ];
    const where: string[] = [];
    const qb: any = {
      orderBy: () => qb,
      skip: () => qb,
      take: () => qb,
      andWhere: (sql: string) => {
        where.push(sql);
        return qb;
      },
      getManyAndCount: async () => [rows, 2],
    };
    const service = new AuditService();
    Object.defineProperty(service, "repo", { get: () => ({ createQueryBuilder: () => qb }) });
    Object.defineProperty(service, "userRepo", { get: () => ({ find: async () => [actor] }) });

    const res = await service.list({ action: "create", actor: "ops", page: 1, limit: 20 });
    expect(res.data[0]?.actor).toEqual(actor);
    expect(res.data[1]?.actor).toBeNull();
    expect(where.some((w) => w.includes("FROM users u"))).toBe(true);
  });

  test("attachActors leaves unknown actors null", () => {
    expect(attachActors([{ actor_id: "gone" }], [])).toEqual([{ actor_id: "gone", actor: null }]);
  });
});
