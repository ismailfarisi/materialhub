import { describe, expect, it } from "bun:test";
// Relative imports: libs/guards depends on libs/database, not the other way round.
import { PERMISSIONS } from "../../../guards/src/permissions.ts";
import { SalesChannelCode } from "../enums/channel.enums.ts";
import { VendorMemberRole } from "../enums/vendor.enums.ts";
import { RestoreReferenceData1794100000000 } from "../migrations/1794100000000-RestoreReferenceData.ts";
import {
  DEFAULT_PAYMENT_METHOD_THRESHOLDS,
  DEFAULT_ROLE_PERMISSIONS,
  DEFAULT_SALES_CHANNELS,
  DEFAULT_SECTION_TYPES,
  DEFAULT_SITE_SETTINGS,
  type Queryable,
  VENDOR_TEMPLATE_LAYOUT,
  applyPaymentMethodThresholds,
  applyRolePermissions,
} from "./reference-data.ts";

// Domains removed on purpose (CLAUDE.md); their reference rows must not return.
const REMOVED = /reel|creator|booking|staff_schedul|beauty|gift|flash|affiliate|referral|quiz/i;

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
      expect(DEFAULT_ROLE_PERMISSIONS[role]).not.toContain("bank.write" as never);
      expect(DEFAULT_ROLE_PERMISSIONS[role]).not.toContain("team.write" as never);
    }
    expect(DEFAULT_ROLE_PERMISSIONS.viewer.every((p) => p.endsWith(".read"))).toBe(true);
  });
});

describe("reference lists", () => {
  it("has a sales channel row for every sales_channels_code_enum value", () => {
    expect(DEFAULT_SALES_CHANNELS.map((c) => c.code).sort()).toEqual(
      Object.values(SalesChannelCode).sort(),
    );
  });

  it("has an active COD threshold", () => {
    expect(DEFAULT_PAYMENT_METHOD_THRESHOLDS.map((t) => t.provider)).toContain("cod");
  });

  it("restores nothing from removed domains", () => {
    const names = [
      ...DEFAULT_SECTION_TYPES.map((t) => t.name),
      ...DEFAULT_SITE_SETTINGS.map((s) => s.key),
    ];
    for (const n of names) expect(n).not.toMatch(REMOVED);
    expect(JSON.stringify(DEFAULT_SECTION_TYPES)).not.toMatch(REMOVED);
  });

  it("template sections only use section types this module creates", () => {
    const types = new Set<string>(DEFAULT_SECTION_TYPES.map((t) => t.name));
    for (const s of VENDOR_TEMPLATE_LAYOUT.sections) expect(types.has(s.type)).toBe(true);
  });

  it("template sections are copyable into vendor storefronts (scope both)", () => {
    const scope = new Map<string, string>(DEFAULT_SECTION_TYPES.map((t) => [t.name, t.scope]));
    for (const s of VENDOR_TEMPLATE_LAYOUT.sections) expect(scope.get(s.type)).toBe("both");
  });
});

function fakeQ(existingCounts: Record<string, number>) {
  const inserts: Array<{ sql: string; params: unknown[] }> = [];
  const q: Queryable = {
    query: async (sql: string, params: unknown[] = []) => {
      if (sql.startsWith("SELECT role::text")) {
        return Object.entries(existingCounts).map(([role, n]) => ({ role, n }));
      }
      inserts.push({ sql, params });
      return [];
    },
  };
  return { q, inserts };
}

describe("applyRolePermissions", () => {
  it("seeds every role on an empty table", async () => {
    const { q, inserts } = fakeQ({});
    await applyRolePermissions(q);
    expect(inserts.map((i) => i.params[0]).sort()).toEqual(Object.values(VendorMemberRole).sort());
    for (const i of inserts) {
      expect(i.sql).toContain('ON CONFLICT ("role", "permission") DO NOTHING');
    }
  });

  it("leaves admin-edited roles alone but always tops up owner", async () => {
    const { q, inserts } = fakeQ({ owner: 3, manager: 1, staff: 0 });
    await applyRolePermissions(q);
    expect(inserts.map((i) => i.params[0]).sort()).toEqual(["owner", "staff", "viewer"]);
  });
});

describe("applyPaymentMethodThresholds", () => {
  it("inserts each provider idempotently", async () => {
    const { q, inserts } = fakeQ({});
    await applyPaymentMethodThresholds(q);
    expect(inserts.map((i) => i.params[0])).toEqual(["tabby", "tamara", "cod"]);
    for (const i of inserts) expect(i.sql).toContain('ON CONFLICT ("provider") DO NOTHING');
  });
});

describe("RestoreReferenceData migration", () => {
  it("only inserts (never updates or deletes) and down() is a no-op", async () => {
    const sqls: string[] = [];
    const runner = {
      query: async (sql: string) => {
        sqls.push(sql);
        return [];
      },
    };
    const m = new RestoreReferenceData1794100000000();
    await m.up(runner as never);
    for (const sql of sqls) expect(sql).not.toMatch(/^\s*(DELETE|TRUNCATE|DROP)/i);
    // No template is created without a super_admin owner, so no UPDATE either.
    expect(sqls.some((s) => /^\s*UPDATE/i.test(s))).toBe(false);

    sqls.length = 0;
    await m.down(runner as never);
    expect(sqls).toEqual([]);
  });
});
