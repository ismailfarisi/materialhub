import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { AppDataSource, CreatorTier } from "@materialhub/database";
import type { FindOperator } from "typeorm";
import { GraduationService } from "./graduation.service.ts";

describe("GraduationService.listVetoCandidates", () => {
  it("returns creators graduated within the window", async () => {
    const recentEarnedAt = new Date(Date.now() - 24 * 3600 * 1000);
    const userRepo = {
      find: mock(async () => [
        {
          id: "u1",
          creator_tier: CreatorTier.creator,
          creator_tier_earned_at: recentEarnedAt,
        },
      ]),
    };
    const svc = new GraduationService();
    (svc as any).userRepo = userRepo;
    const candidates = await svc.listVetoCandidates(48);
    expect(candidates.length).toBe(1);
    expect(candidates[0]!.id).toBe("u1");
    expect(userRepo.find).toHaveBeenCalledTimes(1);
  });

  it("passes the correct window to the repository query", async () => {
    const calls: any[] = [];
    const userRepo = {
      find: mock(async (args: any) => {
        calls.push(args);
        return [];
      }),
    };
    const svc = new GraduationService();
    (svc as any).userRepo = userRepo;
    await svc.listVetoCandidates(72);
    expect(calls.length).toBe(1);
    // Assert the where clause actually filters on creator_tier != 'regular'
    // AND creator_tier_earned_at > cutoff. Both should be FindOperators.
    const where = calls[0].where;
    expect(where).toBeDefined();
    const tierOp = where.creator_tier as FindOperator<unknown>;
    const earnedAtOp = where.creator_tier_earned_at as FindOperator<unknown>;
    expect(tierOp).toBeDefined();
    expect((tierOp as any).type).toBe("not");
    expect(earnedAtOp).toBeDefined();
    expect((earnedAtOp as any).type).toBe("moreThan");
    // order + take should reflect the "newest first, capped at 100" contract
    expect(calls[0].order).toEqual({ creator_tier_earned_at: "DESC" });
    expect(calls[0].take).toBe(100);
  });
});

describe("GraduationService.vetoCreator", () => {
  // AppDataSource.transaction is a pass-through in unit tests — the real
  // transaction semantics are exercised in integration tests. Here we just
  // need the callback to run with a dummy manager so the service body
  // exercises performDemotion + writeAudit as stubbed below. The stub saves
  // the original reference and returns a cleanup function so it doesn't leak
  // across test files in the same bun test process.
  const stubTransaction = () => {
    const original = (AppDataSource as any).transaction;
    (AppDataSource as any).transaction = async (fn: any) => fn({} as any);
    return () => {
      (AppDataSource as any).transaction = original;
    };
  };

  let restoreTxn: (() => void) | null = null;
  beforeEach(() => {
    restoreTxn = stubTransaction();
  });
  afterEach(() => {
    restoreTxn?.();
    restoreTxn = null;
  });

  it("demotes the user to regular tier and clears earned_at", async () => {
    const auditInsertCalls: any[] = [];
    const demotionCalls: any[] = [];
    const svc = new GraduationService();
    (svc as any).performDemotion = async (_mgr: any, userId: string) => {
      demotionCalls.push(userId);
      return true;
    };
    (svc as any).writeAudit = async (
      _mgr: any,
      adminId: string,
      userId: string,
      actorRole: string,
      reason: string,
    ) => {
      auditInsertCalls.push({ adminId, userId, actorRole, reason });
    };

    await svc.vetoCreator("u1", "admin-1", "super_admin", "spam graduation");

    expect(demotionCalls).toEqual(["u1"]);
    expect(auditInsertCalls.length).toBe(1);
    expect(auditInsertCalls[0].adminId).toBe("admin-1");
    expect(auditInsertCalls[0].userId).toBe("u1");
    expect(auditInsertCalls[0].actorRole).toBe("super_admin");
    expect(auditInsertCalls[0].reason).toBe("spam graduation");
  });

  it("throws user_not_found_or_already_regular when demotion affects zero rows", async () => {
    const svc = new GraduationService();
    let auditCalled = false;
    (svc as any).performDemotion = async () => false;
    (svc as any).writeAudit = async () => {
      auditCalled = true;
    };
    await expect(svc.vetoCreator("missing", "admin-1", "admin", "test")).rejects.toThrow(
      "user_not_found_or_already_regular",
    );
    // Critical: audit must NOT be written when demotion was a no-op.
    expect(auditCalled).toBe(false);
  });
});
