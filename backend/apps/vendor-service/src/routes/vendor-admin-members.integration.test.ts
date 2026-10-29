/**
 * Route-wiring tests for the admin-managed team endpoints on
 * /admin/vendors/:id/members (list / invite / change-role / remove).
 *
 * Focus is HTTP-layer concerns: requireRole("admin","super_admin") gating, that
 * the path vendorId + JWT actor flow into VendorMemberService, and the
 * owner-removal guard. The service's business logic is covered by its own unit
 * tests, so the service is stubbed here.
 *
 * Strategy mirrors vendor-members.integration.test.ts: mock.module("../container.ts")
 * injects a stub vendorMemberService. The chain also carries auditPlugin, whose
 * fire-and-forget write calls AppDataSource.getRepository synchronously — we
 * runtime-stub that so no DB is needed.
 */
import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { createHmac } from "node:crypto";
import { config } from "@materialhub/config";
import { AppDataSource } from "@materialhub/database";
import type { HttpError } from "@materialhub/plugins";
import { Elysia } from "elysia";

// ─── Stub VendorMemberService ─────────────────────────────────────────────────
interface Calls {
  list: any[];
  invite: any[];
  changeRole: any[];
  remove: any[];
}
const calls: Calls = { list: [], invite: [], changeRole: [], remove: [] };
let listRows: any[] = [];
let throwOn: { method: string; error: HttpError } | undefined;

function maybeThrow(m: string) {
  if (throwOn?.method === m) throw throwOn.error;
}

const vendorMemberServiceStub = {
  async list(args: any) {
    calls.list.push(args);
    maybeThrow("list");
    return listRows;
  },
  async invite(args: any) {
    calls.invite.push(args);
    maybeThrow("invite");
    return { memberId: "m-new", expiresAt: new Date("2026-08-01T00:00:00Z") };
  },
  async changeRole(args: any) {
    calls.changeRole.push(args);
    maybeThrow("changeRole");
  },
  async remove(args: any) {
    calls.remove.push(args);
    maybeThrow("remove");
  },
};

const containerAbsPath = `${import.meta.dir}/../container.ts`;
mock.module(containerAbsPath, () => ({
  container: new Elysia({ name: "vendor-service-container" }).decorate(
    "vendorMemberService",
    vendorMemberServiceStub,
  ),
}));

// auditPlugin writes fire-and-forget via AppDataSource.getRepository — stub it.
// Capture the original so it can be restored: a leaked override breaks sibling
// test files (e.g. role-permissions-admin) that share this process.
const origGetRepository = (AppDataSource as any).getRepository;
(AppDataSource as any).getRepository = () => ({
  create: (x: any) => x,
  save: async () => ({}),
});

afterAll(() => {
  (AppDataSource as any).getRepository = origGetRepository;
  mock.restore();
});

const { vendorAdminRoutes } = await import("./vendor-admin.routes.ts");

// ─── JWT minter ───────────────────────────────────────────────────────────────
function b64url(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf) : buf;
  return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
function sign(role: string, userId = "admin-1"): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(
    JSON.stringify({
      sub: userId,
      email: "admin@x.com",
      role,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  );
  const sig = b64url(
    createHmac("sha256", config.jwt.accessSecret).update(`${header}.${body}`).digest(),
  );
  return `${header}.${body}.${sig}`;
}

function app(): any {
  return new Elysia().use(vendorAdminRoutes as any);
}

const VID = "11111111-1111-4111-8111-111111111111";
const MID = "22222222-2222-4222-8222-222222222222";

function req(method: string, path: string, token: string, body?: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

beforeEach(() => {
  calls.list = [];
  calls.invite = [];
  calls.changeRole = [];
  calls.remove = [];
  listRows = [];
  throwOn = undefined;
});

describe("admin vendor member routes", () => {
  test("GET members lists with the path vendorId", async () => {
    listRows = [{ id: MID, role: "manager", email: "m@x.com", status: "active" }];
    const res = await app().handle(req("GET", `/admin/vendors/${VID}/members`, sign("admin")));
    expect(res.status).toBe(200);
    expect(calls.list[0]).toEqual({ vendorId: VID });
  });

  test("POST invite passes vendorId + admin actor into the service", async () => {
    const res = await app().handle(
      req("POST", `/admin/vendors/${VID}/members/invite`, sign("super_admin"), {
        email: "new@x.com",
        role: "staff",
      }),
    );
    expect(res.status).toBe(201);
    expect(calls.invite[0]).toEqual({
      vendorId: VID,
      email: "new@x.com",
      role: "staff",
      invitedByUserId: "admin-1",
    });
  });

  test("PATCH changes a member role", async () => {
    const res = await app().handle(
      req("PATCH", `/admin/vendors/${VID}/members/${MID}`, sign("admin"), { role: "manager" }),
    );
    expect(res.status).toBe(200);
    expect(calls.changeRole[0]).toMatchObject({ vendorId: VID, memberId: MID, newRole: "manager" });
  });

  test("DELETE removes a non-owner member", async () => {
    listRows = [{ id: MID, role: "staff", status: "active" }];
    const res = await app().handle(
      req("DELETE", `/admin/vendors/${VID}/members/${MID}`, sign("admin")),
    );
    expect(res.status).toBe(200);
    expect(calls.remove[0]).toMatchObject({ vendorId: VID, memberId: MID });
  });

  test("DELETE refuses to remove the owner (would orphan the vendor)", async () => {
    listRows = [{ id: MID, role: "owner", status: "active" }];
    const res = await app().handle(
      req("DELETE", `/admin/vendors/${VID}/members/${MID}`, sign("super_admin")),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("CANNOT_REMOVE_OWNER");
    expect(calls.remove.length).toBe(0);
  });

  test("rejects non-admin roles", async () => {
    const res = await app().handle(req("GET", `/admin/vendors/${VID}/members`, sign("customer")));
    expect(res.status).toBe(403);
    expect(calls.list.length).toBe(0);
  });
});
