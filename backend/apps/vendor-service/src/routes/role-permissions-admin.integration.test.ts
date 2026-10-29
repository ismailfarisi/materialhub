/**
 * Route-wiring tests for /admin/role-permissions (Task B12, Phase 3a).
 *
 * Verifies super_admin gating, catalog/last-updated GET shape, validation
 * order on PUT (UNKNOWN_PERMISSION, OWNER_PERMISSIONS_LOCKED), and that
 * bumpMatrixVersion is called after a successful PUT.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { createHmac } from "node:crypto";
import { config } from "@materialhub/config";
import { AppDataSource } from "@materialhub/database";
import { Elysia } from "elysia";

// ─── Stubs (declared before any module imports that consume them) ──
let queryHandler: (sql: string, params?: unknown[]) => unknown = () => [];
const queryCalls: { sql: string; params?: unknown[] }[] = [];
let bumpMatrixCalls = 0;

// Save originals so we can restore them after all tests in this file.
const originalQuery = AppDataSource.query.bind(AppDataSource);
const originalTransaction = AppDataSource.transaction.bind(AppDataSource);

// Stub bumpMatrixVersion by mocking the permission-matrix module at its
// absolute path. This avoids a circular reference that occurs when
// mock.module("@materialhub/guards") tries to re-import itself to spread exports.
const permissionMatrixAbsPath = `${import.meta.dir}/../../../../libs/guards/src/permission-matrix.ts`;

mock.module(permissionMatrixAbsPath, () => {
  // Stub bumpMatrixVersion only; preserve a fully functional permissionMatrix
  // singleton so vendor-members and vendor-invites tests (same bun test run)
  // can still call __setMapForTests / has() without breaking.
  const matrixMap = new Map<string, Set<string>>();

  const permissionMatrixStub = {
    __setMapForTests(rows: Array<{ role: string; permission: string }>): void {
      matrixMap.clear();
      for (const { role, permission } of rows) {
        const set = matrixMap.get(role) ?? new Set<string>();
        set.add(permission);
        matrixMap.set(role, set);
      }
    },
    has(role: string, permission: string): boolean {
      return matrixMap.get(role)?.has(permission) ?? false;
    },
    load: async () => {},
    startPolling: () => {},
    stopPolling: () => {},
    checkVersionAndReload: async () => {},
  };

  return {
    bumpMatrixVersion: async () => {
      bumpMatrixCalls += 1;
      return true;
    },
    permissionMatrix: permissionMatrixStub,
    PermissionMatrix: class {},
    __setRedisForTests: () => {},
  };
});

// Now dynamic-import the route file (after mocks) and patch AppDataSource methods.
let rolePermissionsAdminRoutes: any;
beforeAll(async () => {
  const mod = await import("./role-permissions-admin.routes.ts");
  rolePermissionsAdminRoutes = mod.rolePermissionsAdminRoutes;

  // Patch query: route through our handler which records calls.
  (AppDataSource as any).query = async (sql: string, params?: unknown[]) => {
    queryCalls.push({ sql, params });
    return queryHandler(sql, params);
  };

  // Patch transaction: invoke the callback with a stub em that uses our query.
  (AppDataSource as any).transaction = async <T>(cb: (em: any) => Promise<T>): Promise<T> => {
    return cb({
      query: async (sql: string, params?: unknown[]) => {
        queryCalls.push({ sql, params });
        return queryHandler(sql, params);
      },
    });
  };
});

afterAll(() => {
  // Restore originals so other test files in the same run aren't affected.
  (AppDataSource as any).query = originalQuery;
  (AppDataSource as any).transaction = originalTransaction;
});

// ─── JWT minter ────────────────────────────────────────────────────
// Minimal HS256 signer using Node's built-in crypto module — no external JWT
// library needed. Produces tokens that @elysiajs/jwt (via jwtAuth) can verify.

function b64url(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf) : buf;
  return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function signHs256(payload: Record<string, unknown>, secret: string): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(
    JSON.stringify({
      ...payload,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  );
  const sig = b64url(createHmac("sha256", secret).update(`${header}.${body}`).digest());
  return `${header}.${body}.${sig}`;
}

// Deliberately omit `tv` (token_version) — jwtAuth only calls
// getCurrentTokenVersion when `typeof payload.tv === "number"`, so omitting it
// skips the DB/Redis revocation check entirely, keeping tests self-contained.
function signRole(role: string): string {
  return signHs256({ sub: "u-1", email: "admin@x.com", role }, config.jwt.accessSecret);
}

beforeEach(() => {
  queryHandler = () => [];
  queryCalls.length = 0;
  bumpMatrixCalls = 0;
});

// biome-ignore lint/suspicious/noExplicitAny: Elysia's generic chain makes exact typing impractical in tests
function buildApp(): any {
  return new Elysia().use(rolePermissionsAdminRoutes);
}

// ─── Tests ─────────────────────────────────────────────────────────
describe("GET /admin/role-permissions", () => {
  test("returns matrix grouped by role + catalog + lastUpdated metadata", async () => {
    queryHandler = (sql) => {
      if (sql.startsWith("SELECT role, permission, updated_at")) {
        return [
          {
            role: "manager",
            permission: "orders.read",
            updated_at: "2026-05-01T00:00:00Z",
            updated_by_user_id: "admin-1",
          },
          {
            role: "owner",
            permission: "team.write",
            updated_at: "2026-05-02T00:00:00Z",
            updated_by_user_id: "admin-1",
          },
        ];
      }
      if (sql.startsWith("SELECT id, COALESCE")) {
        return [{ id: "admin-1", name: "Alice Admin" }];
      }
      return [];
    };
    const token = signRole("super_admin");
    const app = buildApp();
    const res = await app.handle(
      new Request("http://localhost/admin/role-permissions", {
        headers: { authorization: `Bearer ${token}` },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.matrix.manager).toEqual(["orders.read"]);
    expect(body.data.matrix.owner).toEqual(["team.write"]);
    expect(body.data.matrix.staff).toEqual([]);
    expect(body.data.catalog.length).toBeGreaterThan(0); // PERMISSIONS array
    expect(body.data.lastUpdatedAt).toBe("2026-05-02T00:00:00Z");
    expect(body.data.lastUpdatedBy).toEqual({ userId: "admin-1", name: "Alice Admin" });
  });

  test("returns empty matrix + null lastUpdated when no rows", async () => {
    queryHandler = () => [];
    const token = signRole("super_admin");
    const app = buildApp();
    const res = await app.handle(
      new Request("http://localhost/admin/role-permissions", {
        headers: { authorization: `Bearer ${token}` },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.matrix.owner).toEqual([]);
    expect(body.data.lastUpdatedAt).toBeNull();
    expect(body.data.lastUpdatedBy).toBeNull();
  });

  test("non-super_admin returns 403", async () => {
    const token = signRole("admin");
    const app = buildApp();
    const res = await app.handle(
      new Request("http://localhost/admin/role-permissions", {
        headers: { authorization: `Bearer ${token}` },
      }),
    );
    expect(res.status).toBe(403);
  });

  test("no token returns 401", async () => {
    const app = buildApp();
    const res = await app.handle(new Request("http://localhost/admin/role-permissions"));
    expect(res.status).toBe(401);
  });
});

describe("PUT /admin/role-permissions/:role", () => {
  test("rejects unknown role with INVALID_ROLE", async () => {
    const token = signRole("super_admin");
    const app = buildApp();
    const res = await app.handle(
      new Request("http://localhost/admin/role-permissions/unknown_role", {
        method: "PUT",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ permissions: ["orders.read"] }),
      }),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("INVALID_ROLE");
  });

  test("rejects unknown permissions with UNKNOWN_PERMISSION + listed", async () => {
    const token = signRole("super_admin");
    const app = buildApp();
    const res = await app.handle(
      new Request("http://localhost/admin/role-permissions/manager", {
        method: "PUT",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ permissions: ["orders.read", "totally.fake"] }),
      }),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("UNKNOWN_PERMISSION");
    expect(body.unknown).toContain("totally.fake");
  });

  test("rejects PUT /owner with anything-less-than-full as OWNER_PERMISSIONS_LOCKED", async () => {
    const token = signRole("super_admin");
    const app = buildApp();
    const res = await app.handle(
      new Request("http://localhost/admin/role-permissions/owner", {
        method: "PUT",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ permissions: ["orders.read"] }),
      }),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("OWNER_PERMISSIONS_LOCKED");
    expect(body.missing.length).toBeGreaterThan(0);
  });

  test("happy path: tx replaces rows, audit written, matrix_version bumped", async () => {
    queryHandler = (sql) => {
      if (sql.startsWith("SELECT permission FROM role_permissions WHERE role")) {
        return [{ permission: "orders.read" }];
      }
      return [];
    };
    const token = signRole("super_admin");
    const app = buildApp();
    const res = await app.handle(
      new Request("http://localhost/admin/role-permissions/manager", {
        method: "PUT",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ permissions: ["orders.read", "orders.fulfill"] }),
      }),
    );
    expect(res.status).toBe(200);

    // Verify the SQL flow:
    const sqls = queryCalls.map((c) => c.sql);
    expect(sqls.some((s) => s.startsWith("SELECT permission FROM role_permissions"))).toBe(true);
    expect(sqls.some((s) => s.startsWith("DELETE FROM role_permissions WHERE role"))).toBe(true);
    expect(sqls.filter((s) => s.startsWith("INSERT INTO role_permissions")).length).toBe(2);

    // Audit log written with action='role_permissions.updated'
    const auditCall = queryCalls.find((c) => c.sql.includes("INSERT INTO audit_log"));
    expect(auditCall).toBeDefined();
    const meta = JSON.parse((auditCall!.params as any[])[1]);
    expect(meta).toEqual({
      role: "manager",
      before: ["orders.read"],
      after: ["orders.fulfill", "orders.read"],
    });

    // bumpMatrixVersion called
    expect(bumpMatrixCalls).toBe(1);
  });

  test("non-super_admin PUT returns 403", async () => {
    const token = signRole("admin");
    const app = buildApp();
    const res = await app.handle(
      new Request("http://localhost/admin/role-permissions/manager", {
        method: "PUT",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ permissions: [] }),
      }),
    );
    expect(res.status).toBe(403);
  });
});
