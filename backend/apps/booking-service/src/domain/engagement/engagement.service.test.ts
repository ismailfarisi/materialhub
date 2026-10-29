import { describe, expect, it } from "bun:test";
import { EngagementKind, type StaffEngagement } from "@materialhub/database";
import { ConflictError, NotFoundError } from "@materialhub/plugins";
import type { Repository } from "typeorm";
import { EngagementService } from "./engagement.service.ts";

function make(opts: {
  query?: () => Promise<unknown[]>;
  findOne?: () => Promise<Partial<StaffEngagement> | null>;
}) {
  const updates: Array<{ where: unknown; set: unknown }> = [];
  const foundRow = {
    id: "e1",
    staff_member_id: "s1",
    starts_at: new Date("2026-08-01T09:00:00Z"),
    ends_at: new Date("2026-08-01T10:00:00Z"),
  };
  const repo = {
    manager: {
      query: opts.query ?? (() => Promise.resolve([{ id: "e1" }])),
    },
    findOne: opts.findOne ?? (() => Promise.resolve(foundRow)),
    update: (where: unknown, set: unknown) => {
      updates.push({ where, set });
      return Promise.resolve({ affected: 1 });
    },
  } as unknown as Repository<StaffEngagement>;
  return { svc: new EngagementService(repo), updates };
}

const base = {
  staffMemberId: "s1",
  vendorId: "v1",
  startsAt: "2026-08-01T09:00:00Z",
  endsAt: "2026-08-01T10:00:00Z",
  kind: EngagementKind.marketplace_booking,
};

describe("EngagementService.reserve", () => {
  it("returns the inserted engagement row on success", async () => {
    const { svc } = make({ query: () => Promise.resolve([{ id: "e1", status: "held" }]) });
    const row = await svc.reserve(base);
    expect((row as { id: string }).id).toBe("e1");
  });

  it("maps the Postgres exclusion_violation (23P01) to ConflictError", async () => {
    const { svc } = make({
      query: () => Promise.reject(Object.assign(new Error("exclusion"), { code: "23P01" })),
    });
    await expect(svc.reserve(base)).rejects.toBeInstanceOf(ConflictError);
  });

  it("rethrows non-exclusion database errors", async () => {
    const { svc } = make({
      query: () => Promise.reject(Object.assign(new Error("boom"), { code: "42P01" })),
    });
    await expect(svc.reserve(base)).rejects.toThrow("boom");
  });
});

describe("EngagementService.move (Phase 5 Task 3 reschedule)", () => {
  const moveInput = {
    engagementId: "e1",
    staffMemberId: "s2",
    startsAt: "2026-08-05T09:00:00Z",
    endsAt: "2026-08-05T10:00:00Z",
  };

  it("returns the updated row on success (UPDATE ... RETURNING *)", async () => {
    const { svc } = make({
      query: () => Promise.resolve([{ id: "e1", staff_member_id: "s2" }]),
    });
    const row = await svc.move(moveInput);
    expect((row as { staff_member_id: string }).staff_member_id).toBe("s2");
  });

  it("maps the EXCLUDE exclusion_violation (23P01) to ConflictError (409)", async () => {
    const { svc } = make({
      query: () => Promise.reject(Object.assign(new Error("exclusion"), { code: "23P01" })),
    });
    await expect(svc.move(moveInput)).rejects.toBeInstanceOf(ConflictError);
  });

  it("rethrows non-exclusion database errors unchanged", async () => {
    const { svc } = make({
      query: () => Promise.reject(Object.assign(new Error("boom"), { code: "42P01" })),
    });
    await expect(svc.move(moveInput)).rejects.toThrow("boom");
  });

  it("throws NotFoundError when the engagement to move does not exist", async () => {
    const { svc } = make({ findOne: () => Promise.resolve(null) });
    await expect(svc.move(moveInput)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("invalidates BOTH the old and new staff/day cache keys", async () => {
    const invalidated: Array<{ staffId: string; start: Date; end: Date }> = [];
    const cache = {
      invalidateRange: (staffId: string, start: Date, end: Date) => {
        invalidated.push({ staffId, start, end });
        return Promise.resolve();
      },
    };
    const repo = {
      manager: {
        query: () =>
          Promise.resolve([
            {
              id: "e1",
              staff_member_id: "s2",
              starts_at: new Date("2026-08-05T09:00:00Z"),
              ends_at: new Date("2026-08-05T10:00:00Z"),
            },
          ]),
      },
      findOne: () =>
        Promise.resolve({
          id: "e1",
          staff_member_id: "s1",
          starts_at: new Date("2026-08-01T09:00:00Z"),
          ends_at: new Date("2026-08-01T10:00:00Z"),
        }),
      // biome-ignore lint/suspicious/noExplicitAny: minimal fake repo
    } as any;
    const svc = new EngagementService(repo, cache as any);
    await svc.move(moveInput);
    // Old staff (s1) then new staff (s2) — two distinct invalidations.
    expect(invalidated.map((i) => i.staffId)).toEqual(["s1", "s2"]);
  });
});

describe("EngagementService.release / cancel", () => {
  it("release sets status=released", async () => {
    const { svc, updates } = make({});
    await svc.release("e1");
    expect(updates[0]).toEqual({ where: { id: "e1" }, set: { status: "released" } });
  });

  it("cancel sets status=cancelled", async () => {
    const { svc, updates } = make({});
    await svc.cancel("e1");
    expect(updates[0]).toEqual({ where: { id: "e1" }, set: { status: "cancelled" } });
  });

  it("throws NotFoundError when the engagement row does not exist", async () => {
    const { svc } = make({ findOne: () => Promise.resolve(null) });
    await expect(svc.release("missing")).rejects.toBeInstanceOf(NotFoundError);
  });
});
