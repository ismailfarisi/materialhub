// location-membership.service.test.ts
//
// Mocked-repo unit tests (no live DB) for the Task 0B location-membership CRUD.
// Covers: owner/manager-only gating (a location-admin/staff is blocked — no
// self-grant/escalation), location-belongs-to-vendor 404, the "grant is a
// subset of vendor membership" 422, find-then-write duplicate reactivation
// (NOT a double-insert), and delete scoping (wrong-location/nonexistent 404).
import { describe, expect, it, mock } from "bun:test";
import { ForbiddenError, NotFoundError, UnprocessableEntityError } from "@materialhub/plugins";
import { LocationMembershipService } from "./location-membership.service.ts";

const OWNER = { userId: "user-owner", vendorId: "vendor-1", role: "owner" };
const MANAGER = { userId: "user-mgr", vendorId: "vendor-1", role: "manager" };
const STAFF = { userId: "user-staff", vendorId: "vendor-1", role: "staff" };
// A per-location admin: even holding a managing location_membership, they must
// NOT be able to manage memberships (privilege-escalation guard).
const LOCATION_ADMIN = { userId: "user-locadmin", vendorId: "vendor-1", role: "admin" };

function makeHarness(
  opts: {
    locations?: Array<{ id: string; vendor_id: string }>;
    memberships?: Array<Record<string, unknown>>;
    vendorMember?: Record<string, unknown> | null;
    users?: Array<{ id: string; first_name: string; last_name: string; email: string }>;
  } = {},
) {
  const locations = opts.locations ?? [{ id: "loc-1", vendor_id: "vendor-1" }];
  const memberships = opts.memberships ?? [];
  const users = opts.users ?? [];

  const locationRepo = {
    findOne: mock(
      async ({ where }: { where: { id: string } }) =>
        locations.find((l) => l.id === where.id) ?? null,
    ),
    // listMine()'s cross-vendor check: `find({ where: { id: In(locationIds) } })`.
    // The `where.id` FindOperator isn't inspected — the fixture `locations`
    // array is already scoped to what each test needs, same precedent as
    // staff.service.test.ts's offeringFind mock.
    find: mock(async () => locations),
  };

  // A fake membership repo whose transaction hands back a tx repo that queries
  // the same in-memory `memberships` array (respecting withDeleted) and records
  // create()/save() so tests can assert insert-vs-reactivate.
  const saved: Array<Record<string, unknown>> = [];
  const created: Array<Record<string, unknown>> = [];
  const txRepo = {
    findOne: mock(
      async ({
        where,
        withDeleted,
      }: {
        where: { vendor_location_id: string; user_id: string };
        withDeleted?: boolean;
      }) => {
        const matches = memberships.filter(
          (m) => m.vendor_location_id === where.vendor_location_id && m.user_id === where.user_id,
        );
        // Default query excludes soft-deleted; withDeleted includes them.
        const pool = withDeleted ? matches : matches.filter((m) => !m.deleted_at);
        return pool[0] ? { ...pool[0] } : null;
      },
    ),
    create: mock((row: Record<string, unknown>) => {
      const entity = { id: "new-membership", permissions: [], ...row };
      created.push(entity);
      return entity;
    }),
    save: mock(async (row: Record<string, unknown>) => {
      saved.push(row);
      return {
        created_at: new Date("2026-01-01T00:00:00Z"),
        updated_at: new Date("2026-01-01T00:00:00Z"),
        permissions: [],
        ...row,
      };
    }),
  };
  const membershipRepo = {
    // Generalized to serve BOTH list()'s `where: { vendor_location_id }` and
    // listMine()'s `where: { user_id }` — filters on whichever key(s) are
    // present, soft-deleted rows always excluded (mirrors TypeORM's default
    // find() behavior for a @DeleteDateColumn entity).
    find: mock(
      async ({
        where,
      }: {
        where: { vendor_location_id?: string; user_id?: string };
      }) =>
        memberships.filter(
          (m) =>
            (where.vendor_location_id === undefined ||
              m.vendor_location_id === where.vendor_location_id) &&
            (where.user_id === undefined || m.user_id === where.user_id) &&
            !m.deleted_at,
        ),
    ),
    findOne: mock(
      async ({ where }: { where: { id: string; vendor_location_id: string } }) =>
        memberships.find(
          (m) =>
            m.id === where.id && m.vendor_location_id === where.vendor_location_id && !m.deleted_at,
        ) ?? null,
    ),
    softDelete: mock(async () => ({ affected: 1 })),
    manager: {
      transaction: mock(async (cb: (m: unknown) => Promise<unknown>) =>
        cb({ getRepository: () => txRepo }),
      ),
    },
  };

  const vendorMemberRepo = {
    findOne: mock(async () => (opts.vendorMember === undefined ? null : opts.vendorMember)),
  };
  const userRepo = {
    find: mock(async ({ where }: { where: { id: { _value?: string[] } } }) => users),
    findOne: mock(
      async ({ where }: { where: { id: string } }) => users.find((u) => u.id === where.id) ?? null,
    ),
  };

  const svc = new LocationMembershipService(
    // biome-ignore lint/suspicious/noExplicitAny: minimal fake repos
    locationRepo as any,
    // biome-ignore lint/suspicious/noExplicitAny: minimal fake repos
    membershipRepo as any,
    // biome-ignore lint/suspicious/noExplicitAny: minimal fake repos
    vendorMemberRepo as any,
    // biome-ignore lint/suspicious/noExplicitAny: minimal fake repos
    userRepo as any,
  );

  return { svc, membershipRepo, vendorMemberRepo, locationRepo, txRepo, saved, created };
}

const ACTIVE_MEMBER = {
  id: "vm-1",
  vendor_id: "vendor-1",
  user_id: "user-target",
  status: "active",
};

describe("LocationMembershipService — owner/manager-only gating", () => {
  it("staff role is blocked from list/create/delete (403)", async () => {
    const { svc } = makeHarness({});
    await expect(svc.list(STAFF, "loc-1")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      svc.create(STAFF, "loc-1", { userId: "user-target", role: "manager" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(svc.delete(STAFF, "loc-1", "m-1")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("location-admin (per-location managing role) is ALSO blocked — no self-grant/escalation", async () => {
    const { svc, membershipRepo } = makeHarness({});
    await expect(
      svc.create(LOCATION_ADMIN, "loc-1", { userId: "user-target", role: "manager" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    // Never even reached the write transaction.
    expect(membershipRepo.manager.transaction).not.toHaveBeenCalled();
  });

  it("owner and manager both pass the gate", async () => {
    for (const actor of [OWNER, MANAGER]) {
      const { svc } = makeHarness({});
      await expect(svc.list(actor, "loc-1")).resolves.toEqual([]);
    }
  });
});

describe("LocationMembershipService — location ownership", () => {
  it("location of another vendor -> 404", async () => {
    const { svc } = makeHarness({ locations: [{ id: "loc-1", vendor_id: "vendor-2" }] });
    await expect(svc.list(OWNER, "loc-1")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("nonexistent location -> 404", async () => {
    const { svc } = makeHarness({ locations: [] });
    await expect(svc.list(OWNER, "loc-1")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("LocationMembershipService.create", () => {
  it("rejects a target that is NOT an active vendor member (422)", async () => {
    const { svc, membershipRepo } = makeHarness({ vendorMember: null });
    await expect(
      svc.create(OWNER, "loc-1", { userId: "outsider", role: "manager" }),
    ).rejects.toBeInstanceOf(UnprocessableEntityError);
    expect(membershipRepo.manager.transaction).not.toHaveBeenCalled();
  });

  it("new (location,user): inserts a fresh row", async () => {
    const { svc, created, saved } = makeHarness({
      vendorMember: ACTIVE_MEMBER,
      memberships: [],
      users: [
        { id: "user-target", first_name: "Sara", last_name: "Ali", email: "sara@example.com" },
      ],
    });
    const row = await svc.create(OWNER, "loc-1", { userId: "user-target", role: "manager" });
    expect(created.length).toBe(1);
    expect(saved.length).toBe(1);
    expect(row.role).toBe("manager");
    expect(row.user_name).toBe("Sara Ali");
    expect(row.user_email).toBe("sara@example.com");
  });

  it("duplicate active (location,user): UPDATES in place, never double-inserts", async () => {
    const { svc, created, saved } = makeHarness({
      vendorMember: ACTIVE_MEMBER,
      memberships: [
        {
          id: "m-existing",
          vendor_location_id: "loc-1",
          user_id: "user-target",
          role: "admin",
          deleted_at: null,
        },
      ],
    });
    const row = await svc.create(OWNER, "loc-1", { userId: "user-target", role: "manager" });
    // Reused the existing row (no create), role updated to the new value.
    expect(created.length).toBe(0);
    expect(saved.length).toBe(1);
    expect((saved[0] as Record<string, unknown>).id).toBe("m-existing");
    expect(row.role).toBe("manager");
  });

  it("soft-deleted (location,user): REACTIVATES (deleted_at -> null), never double-inserts", async () => {
    const { svc, created, saved } = makeHarness({
      vendorMember: ACTIVE_MEMBER,
      memberships: [
        {
          id: "m-deleted",
          vendor_location_id: "loc-1",
          user_id: "user-target",
          role: "manager",
          deleted_at: new Date("2026-01-01T00:00:00Z"),
        },
      ],
    });
    await svc.create(OWNER, "loc-1", { userId: "user-target", role: "admin" });
    expect(created.length).toBe(0);
    expect(saved.length).toBe(1);
    const savedRow = saved[0] as Record<string, unknown>;
    expect(savedRow.id).toBe("m-deleted");
    expect(savedRow.deleted_at).toBeNull(); // reactivated
    expect(savedRow.role).toBe("admin");
  });
});

describe("LocationMembershipService.delete", () => {
  it("membership of this location: soft-deletes", async () => {
    const { svc, membershipRepo } = makeHarness({
      memberships: [
        {
          id: "m-1",
          vendor_location_id: "loc-1",
          user_id: "user-target",
          role: "manager",
          deleted_at: null,
        },
      ],
    });
    const res = await svc.delete(OWNER, "loc-1", "m-1");
    expect(res).toEqual({ deleted: true });
    expect(membershipRepo.softDelete).toHaveBeenCalledWith({ id: "m-1" });
  });

  it("membership id for a different location (or nonexistent) -> 404, never soft-deletes", async () => {
    const { svc, membershipRepo } = makeHarness({
      memberships: [
        {
          id: "m-1",
          vendor_location_id: "loc-2",
          user_id: "user-target",
          role: "manager",
          deleted_at: null,
        },
      ],
      locations: [
        { id: "loc-1", vendor_id: "vendor-1" },
        { id: "loc-2", vendor_id: "vendor-1" },
      ],
    });
    await expect(svc.delete(OWNER, "loc-1", "m-1")).rejects.toBeInstanceOf(NotFoundError);
    expect(membershipRepo.softDelete).not.toHaveBeenCalled();
  });
});

// GET /manage/my-location-memberships (Task 7 fix cycle, Important #2) — a
// self-scoped read: no owner/manager gate (unlike list/create/delete above),
// just "what does the caller themselves hold".
describe("LocationMembershipService.listMine", () => {
  it("owner/manager: returns [] without querying (they pass vendor-wide, no rows needed)", async () => {
    for (const actor of [OWNER, MANAGER]) {
      const { svc, membershipRepo } = makeHarness({});
      await expect(svc.listMine(actor)).resolves.toEqual([]);
      expect(membershipRepo.find).not.toHaveBeenCalled();
    }
  });

  it("staff/location-admin: returns their OWN active rows for the active vendor", async () => {
    const { svc } = makeHarness({
      locations: [
        { id: "loc-1", vendor_id: "vendor-1" },
        { id: "loc-2", vendor_id: "vendor-1" },
      ],
      memberships: [
        {
          id: "m-1",
          vendor_location_id: "loc-1",
          user_id: LOCATION_ADMIN.userId,
          role: "admin",
          deleted_at: null,
        },
        {
          id: "m-2",
          vendor_location_id: "loc-2",
          user_id: LOCATION_ADMIN.userId,
          role: "manager",
          deleted_at: null,
        },
        // Another user's row for the same vendor — must never leak into
        // LOCATION_ADMIN's response.
        {
          id: "m-3",
          vendor_location_id: "loc-1",
          user_id: "someone-else",
          role: "admin",
          deleted_at: null,
        },
      ],
    });
    const rows = await svc.listMine(LOCATION_ADMIN);
    expect(rows).toEqual(
      expect.arrayContaining([
        { location_id: "loc-1", role: "admin" },
        { location_id: "loc-2", role: "manager" },
      ]),
    );
    expect(rows).toHaveLength(2);
  });

  it("no memberships: returns [] without hitting the location cross-check", async () => {
    const { svc, locationRepo } = makeHarness({ memberships: [] });
    await expect(svc.listMine(STAFF)).resolves.toEqual([]);
    expect(locationRepo.find).not.toHaveBeenCalled();
  });

  it("a membership row for another vendor's location is excluded (cross-vendor defense in depth)", async () => {
    const { svc } = makeHarness({
      locations: [{ id: "loc-other-vendor", vendor_id: "vendor-2" }],
      memberships: [
        {
          id: "m-1",
          vendor_location_id: "loc-other-vendor",
          user_id: STAFF.userId,
          role: "admin",
          deleted_at: null,
        },
      ],
    });
    await expect(svc.listMine(STAFF)).resolves.toEqual([]);
  });

  it("soft-deleted rows are excluded", async () => {
    const { svc } = makeHarness({
      locations: [{ id: "loc-1", vendor_id: "vendor-1" }],
      memberships: [
        {
          id: "m-1",
          vendor_location_id: "loc-1",
          user_id: STAFF.userId,
          role: "admin",
          deleted_at: new Date("2026-01-01T00:00:00Z"),
        },
      ],
    });
    await expect(svc.listMine(STAFF)).resolves.toEqual([]);
  });
});
