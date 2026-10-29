import { describe, expect, mock, test } from "bun:test";
import { VendorMemberRole } from "@materialhub/database";
import { PermissionMatrix, __setRedisForTests as setRedis } from "./permission-matrix.ts";

function fakeRedis(initialVersion: string | null) {
  let version = initialVersion;
  return {
    isOpen: true,
    get: mock((_k: string) => Promise.resolve(version)),
    set: (_k: string, v: string) => {
      version = v;
      return Promise.resolve("OK");
    },
    setVersion: (v: string) => {
      version = v;
    },
  };
}

function fakeDS(rows: Array<{ role: string; permission: string }>) {
  return {
    query: mock(() => Promise.resolve(rows)),
  };
}

describe("PermissionMatrix", () => {
  test("has() returns true for granted (role, permission)", async () => {
    const ds = fakeDS([
      { role: "owner", permission: "orders.refund" },
      { role: "manager", permission: "orders.refund" },
      { role: "manager", permission: "team.read" },
    ]);
    const r = fakeRedis("1");
    setRedis(r as unknown as never);
    const m = new PermissionMatrix(ds as unknown as never);
    await m.load();
    expect(m.has(VendorMemberRole.owner, "orders.refund")).toBe(true);
    expect(m.has(VendorMemberRole.manager, "team.read")).toBe(true);
    expect(m.has(VendorMemberRole.manager, "team.write")).toBe(false);
    expect(m.has(VendorMemberRole.viewer, "orders.refund")).toBe(false);
  });

  test("polling reload kicks in when matrix_version changes", async () => {
    const ds = fakeDS([{ role: "manager", permission: "team.read" }]);
    const r = fakeRedis("1");
    setRedis(r as unknown as never);
    const m = new PermissionMatrix(ds as unknown as never);
    await m.load();
    expect(ds.query.mock.calls.length).toBe(1);
    expect(m.has(VendorMemberRole.manager, "team.read")).toBe(true);
    r.setVersion("2");
    ds.query.mockImplementation(() =>
      Promise.resolve([{ role: "manager", permission: "team.write" }]),
    );
    await m.checkVersionAndReload();
    expect(ds.query.mock.calls.length).toBe(2);
    expect(m.has(VendorMemberRole.manager, "team.read")).toBe(false);
    expect(m.has(VendorMemberRole.manager, "team.write")).toBe(true);
  });

  test("polling skips reload when version unchanged", async () => {
    const ds = fakeDS([{ role: "owner", permission: "team.write" }]);
    const r = fakeRedis("5");
    setRedis(r as unknown as never);
    const m = new PermissionMatrix(ds as unknown as never);
    await m.load();
    expect(ds.query.mock.calls.length).toBe(1);
    await m.checkVersionAndReload();
    await m.checkVersionAndReload();
    expect(ds.query.mock.calls.length).toBe(1);
  });

  test("has() returns false for unknown role", async () => {
    const ds = fakeDS([]);
    const r = fakeRedis("1");
    setRedis(r as unknown as never);
    const m = new PermissionMatrix(ds as unknown as never);
    await m.load();
    expect(m.has("not_a_role" as VendorMemberRole, "orders.read")).toBe(false);
  });
});
