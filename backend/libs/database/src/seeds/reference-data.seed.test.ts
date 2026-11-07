import { describe, expect, it } from "bun:test";
import type { DataSource } from "typeorm";
// Relative import: libs/guards depends on libs/database, not the other way round.
import { PERMISSIONS } from "../../../guards/src/permissions.ts";
import { VendorMemberRole } from "../enums/vendor.enums.ts";
import {
  DEFAULT_PAYMENT_METHOD_THRESHOLDS,
  DEFAULT_ROLE_PERMISSIONS,
  seedPaymentMethodThresholds,
  seedRolePermissions,
} from "./reference-data.seed.ts";

describe("DEFAULT_ROLE_PERMISSIONS", () => {
  it("covers every vendor member role", () => {
    expect(Object.keys(DEFAULT_ROLE_PERMISSIONS).sort()).toEqual(
      Object.values(VendorMemberRole).sort(),
    );
  });

  it("only uses permissions from the guards catalogue", () => {
    const known = new Set<string>(PERMISSIONS);
    for (const perms of Object.values(DEFAULT_ROLE_PERMISSIONS)) {
      for (const p of perms) expect(known.has(p)).toBe(true);
    }
  });

  it("gives owner every permission (the admin route locks owner to the full set)", () => {
    expect([...DEFAULT_ROLE_PERMISSIONS.owner].sort()).toEqual([...PERMISSIONS].sort());
  });

  it("keeps bank and team writes owner-only and viewer read-only", () => {
    for (const role of ["manager", "staff", "viewer"] as const) {
      expect(DEFAULT_ROLE_PERMISSIONS[role]).not.toContain("bank.write");
      expect(DEFAULT_ROLE_PERMISSIONS[role]).not.toContain("team.write");
    }
    expect(DEFAULT_ROLE_PERMISSIONS.viewer.every((p) => p.endsWith(".read"))).toBe(true);
  });
});

function fakeDs(existingCounts: Record<string, number>) {
  const inserts: Array<{ sql: string; params: unknown[] }> = [];
  const ds = {
    query: async (sql: string, params: unknown[] = []) => {
      if (sql.startsWith("SELECT role::text")) {
        return Object.entries(existingCounts).map(([role, n]) => ({ role, n }));
      }
      inserts.push({ sql, params });
      return [];
    },
  } as unknown as DataSource;
  return { ds, inserts };
}

describe("seedRolePermissions", () => {
  it("seeds every role on an empty table", async () => {
    const { ds, inserts } = fakeDs({});
    await seedRolePermissions(ds);
    expect(inserts.map((i) => i.params[0]).sort()).toEqual(Object.values(VendorMemberRole).sort());
    for (const i of inserts) expect(i.sql).toContain("ON CONFLICT (role, permission) DO NOTHING");
  });

  it("leaves admin-edited roles alone but always tops up owner", async () => {
    const { ds, inserts } = fakeDs({ owner: 3, manager: 1, staff: 0 });
    await seedRolePermissions(ds);
    expect(inserts.map((i) => i.params[0]).sort()).toEqual(["owner", "staff", "viewer"]);
  });
});

describe("seedPaymentMethodThresholds", () => {
  it("includes an active COD row and inserts each provider idempotently", async () => {
    expect(DEFAULT_PAYMENT_METHOD_THRESHOLDS.map((t) => t.provider)).toContain("cod");
    const { ds, inserts } = fakeDs({});
    await seedPaymentMethodThresholds(ds);
    expect(inserts.map((i) => i.params[0])).toEqual(["tabby", "tamara", "cod"]);
    for (const i of inserts) expect(i.sql).toContain("ON CONFLICT (provider) DO NOTHING");
  });
});
