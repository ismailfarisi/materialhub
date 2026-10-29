/**
 * Route-wiring tests for /vendors/:vendorId/members (Phase 3a Task B8).
 *
 * Verifies team.write gating, vendorId-mismatch handling, and HttpError → JSON
 * mapping. The deep business-logic cases (ALREADY_MEMBER, INVITE_NOT_PENDING,
 * etc.) are covered by VendorMemberService's unit tests — this file focuses on
 * HTTP-layer concerns only.
 *
 * Strategy: mock.module("../container.ts") replaces the Elysia container
 * with a stub that decorates `vendorMemberService` from the shared stub object.
 * This avoids any DB or Redis dependency.
 */
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { createHmac } from "node:crypto";
import { config } from "@materialhub/config";
import { permissionMatrix } from "@materialhub/guards";
import { HttpError } from "@materialhub/plugins";
import { Elysia } from "elysia";

// ─── Stub VendorMemberService ─────────────────────────────────────────────────

interface StubServiceCalls {
  invite: unknown[];
  list: unknown[];
  changeRole: unknown[];
  remove: unknown[];
  resendInvite: unknown[];
  transferOwnership: unknown[];
}

interface StubThrowConfig {
  method: string;
  error: HttpError;
}

interface StubService {
  calls: StubServiceCalls;
  invite(args: unknown): Promise<{ memberId: string; expiresAt: Date }>;
  list(args: unknown): Promise<unknown[]>;
  changeRole(args: unknown): Promise<void>;
  remove(args: unknown): Promise<void>;
  resendInvite(args: unknown): Promise<{ expiresAt: Date }>;
  transferOwnership(args: unknown): Promise<void>;
}

let stubThrow: StubThrowConfig | undefined;
const stubCalls: StubServiceCalls = {
  invite: [],
  list: [],
  changeRole: [],
  remove: [],
  resendInvite: [],
  transferOwnership: [],
};

function resetStub() {
  stubCalls.invite = [];
  stubCalls.list = [];
  stubCalls.changeRole = [];
  stubCalls.remove = [];
  stubCalls.resendInvite = [];
  stubCalls.transferOwnership = [];
  stubThrow = undefined;
}

function maybeThrow(method: string): void {
  if (stubThrow?.method === method) throw stubThrow.error;
}

const vendorMemberServiceStub: StubService = {
  calls: stubCalls,
  async invite(args) {
    stubCalls.invite.push(args);
    maybeThrow("invite");
    return { memberId: "m-new", expiresAt: new Date("2026-06-01T00:00:00Z") };
  },
  async list(args) {
    stubCalls.list.push(args);
    maybeThrow("list");
    return [];
  },
  async changeRole(args) {
    stubCalls.changeRole.push(args);
    maybeThrow("changeRole");
  },
  async remove(args) {
    stubCalls.remove.push(args);
    maybeThrow("remove");
  },
  async resendInvite(args) {
    stubCalls.resendInvite.push(args);
    maybeThrow("resendInvite");
    return { expiresAt: new Date("2026-06-01T00:00:00Z") };
  },
  async transferOwnership(args) {
    stubCalls.transferOwnership.push(args);
    maybeThrow("transferOwnership");
  },
};

// ─── Mock container before importing routes ───────────────────────────────────
// Elysia deduplicates plugins by name — a parent .decorate() cannot override
// a named plugin that was already registered. mock.module is the only reliable
// way to inject the stub before the route module binds its container.
//
// Bun resolves mock.module keys to absolute paths; use import.meta.dir to
// construct the correct resolved path rather than a bare relative specifier.
const containerAbsPath = `${import.meta.dir}/../container.ts`;

mock.module(containerAbsPath, () => ({
  container: new Elysia({ name: "vendor-service-container" }).decorate(
    "vendorMemberService",
    vendorMemberServiceStub,
  ),
}));

// Dynamic import AFTER mock.module so the stub container is in place.
const { vendorMembersRoutes } = await import("./vendor-members.routes.ts");

// ─── JWT minter ───────────────────────────────────────────────────────────────
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

interface SignOpts {
  userId: string;
  email: string;
  vendorId: string;
  role: "owner" | "manager" | "staff" | "viewer";
}

function signMember(opts: SignOpts): string {
  // Deliberately omit `tv` (token_version) — jwtAuth only calls
  // getCurrentTokenVersion when `typeof payload.tv === "number"`, so omitting it
  // skips the DB/Redis revocation check entirely, keeping tests self-contained.
  return signHs256(
    {
      sub: opts.userId,
      email: opts.email,
      role: "customer",
      vm: [{ vid: opts.vendorId, r: opts.role }],
    },
    config.jwt.accessSecret,
  );
}

// ─── Build test app ───────────────────────────────────────────────────────────

// biome-ignore lint/suspicious/noExplicitAny: Elysia's generic chain makes exact typing impractical in tests
function buildApp(): any {
  // biome-ignore lint/suspicious/noExplicitAny: test-only cast
  return new Elysia().use(vendorMembersRoutes as any);
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeAll(() => {
  // Seed the permission matrix singleton. Owner has team.write; manager does not.
  permissionMatrix.__setMapForTests([
    { role: "owner", permission: "team.write" },
    { role: "owner", permission: "team.read" },
    { role: "manager", permission: "team.read" },
    // manager intentionally lacks team.write
  ]);
});

afterAll(() => {
  resetStub();
});

// ─── POST /vendors/:vendorId/members/invite ───────────────────────────────────

describe("POST /vendors/:vendorId/members/invite", () => {
  test("owner can invite — 201, service called with normalized args", async () => {
    resetStub();
    const app = buildApp();
    const token = signMember({
      userId: "u-owner",
      email: "owner@x.com",
      vendorId: "v-1",
      role: "owner",
    });

    const res = await app.handle(
      new Request("http://localhost/vendors/v-1/members/invite", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ email: "new@y.com", role: "manager" }),
      }),
    );

    expect(res.status).toBe(201);
    expect(stubCalls.invite).toHaveLength(1);
    expect(stubCalls.invite[0]).toMatchObject({
      vendorId: "v-1",
      email: "new@y.com",
      role: "manager",
      invitedByUserId: "u-owner",
    });
  });

  test("manager forbidden — 403, no team.write permission, service never called", async () => {
    resetStub();
    const app = buildApp();
    const token = signMember({
      userId: "u-mgr",
      email: "mgr@x.com",
      vendorId: "v-1",
      role: "manager",
    });

    const res = await app.handle(
      new Request("http://localhost/vendors/v-1/members/invite", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ email: "new@y.com", role: "staff" }),
      }),
    );

    expect(res.status).toBe(403);
    expect(stubCalls.invite).toHaveLength(0);
  });

  test("no token returns 401", async () => {
    resetStub();
    const app = buildApp();

    const res = await app.handle(
      new Request("http://localhost/vendors/v-1/members/invite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "new@y.com", role: "staff" }),
      }),
    );

    expect(res.status).toBe(401);
    expect(stubCalls.invite).toHaveLength(0);
  });

  test("HttpError from service maps to structured JSON (409 ALREADY_MEMBER)", async () => {
    resetStub();
    stubThrow = {
      method: "invite",
      error: new HttpError(409, "User is already an active member", "ALREADY_MEMBER"),
    };
    const app = buildApp();
    const token = signMember({
      userId: "u-owner",
      email: "owner@x.com",
      vendorId: "v-1",
      role: "owner",
    });

    const res = await app.handle(
      new Request("http://localhost/vendors/v-1/members/invite", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ email: "x@y.com", role: "manager" }),
      }),
    );

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string; message: string; statusCode: number };
    expect(body.error).toBe("ALREADY_MEMBER");
    expect(body.message).toContain("active member");
    expect(body.statusCode).toBe(409);
  });
});

// ─── Cross-vendor manipulation ────────────────────────────────────────────────

describe("Cross-vendor manipulation", () => {
  test("owner of V1 hitting /vendors/V2/members returns 403 INVALID_ACTIVE_VENDOR", async () => {
    resetStub();
    const app = buildApp();
    // Token has membership only for v-1; path vendorId is v-2.
    // vendorMembership resolves active = v-1 (only membership), then the route
    // handler calls assertVendorIdMatches("v-2", "v-1") which throws HttpError(403).
    const token = signMember({
      userId: "u-owner",
      email: "o@x.com",
      vendorId: "v-1",
      role: "owner",
    });

    const res = await app.handle(
      new Request("http://localhost/vendors/v-2/members/invite", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ email: "x@y.com", role: "manager" }),
      }),
    );

    expect(res.status).toBe(403);
    expect(stubCalls.invite).toHaveLength(0);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("INVALID_ACTIVE_VENDOR");
  });
});

// ─── GET /vendors/:vendorId/members ──────────────────────────────────────────

describe("GET /vendors/:vendorId/members", () => {
  test("owner can list — 200, service called with vendorId", async () => {
    resetStub();
    const app = buildApp();
    const token = signMember({
      userId: "u-owner",
      email: "o@x.com",
      vendorId: "v-1",
      role: "owner",
    });

    const res = await app.handle(
      new Request("http://localhost/vendors/v-1/members", {
        headers: { authorization: `Bearer ${token}` },
      }),
    );

    expect(res.status).toBe(200);
    expect(stubCalls.list).toHaveLength(1);
    expect(stubCalls.list[0]).toEqual({ vendorId: "v-1" });
  });

  test("manager forbidden — 403 for GET too (lacks team.write)", async () => {
    resetStub();
    const app = buildApp();
    const token = signMember({
      userId: "u-mgr",
      email: "mgr@x.com",
      vendorId: "v-1",
      role: "manager",
    });

    const res = await app.handle(
      new Request("http://localhost/vendors/v-1/members", {
        headers: { authorization: `Bearer ${token}` },
      }),
    );

    expect(res.status).toBe(403);
    expect(stubCalls.list).toHaveLength(0);
  });
});

// ─── PATCH /vendors/:vendorId/members/:memberId ───────────────────────────────

describe("PATCH /vendors/:vendorId/members/:memberId", () => {
  test("owner can change role — 200, service called with right args", async () => {
    resetStub();
    const app = buildApp();
    const token = signMember({
      userId: "u-owner",
      email: "o@x.com",
      vendorId: "v-1",
      role: "owner",
    });

    const res = await app.handle(
      new Request("http://localhost/vendors/v-1/members/m-target", {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ role: "viewer" }),
      }),
    );

    expect(res.status).toBe(200);
    expect(stubCalls.changeRole).toHaveLength(1);
    expect(stubCalls.changeRole[0]).toMatchObject({
      vendorId: "v-1",
      memberId: "m-target",
      newRole: "viewer",
      actorUserId: "u-owner",
    });
  });
});

// ─── DELETE /vendors/:vendorId/members/:memberId ──────────────────────────────

describe("DELETE /vendors/:vendorId/members/:memberId", () => {
  test("owner can remove — 200, service called with right args", async () => {
    resetStub();
    const app = buildApp();
    const token = signMember({
      userId: "u-owner",
      email: "o@x.com",
      vendorId: "v-1",
      role: "owner",
    });

    const res = await app.handle(
      new Request("http://localhost/vendors/v-1/members/m-target", {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
      }),
    );

    expect(res.status).toBe(200);
    expect(stubCalls.remove).toHaveLength(1);
    expect(stubCalls.remove[0]).toMatchObject({
      vendorId: "v-1",
      memberId: "m-target",
      actorUserId: "u-owner",
    });
  });

  test("HttpError from service (422) maps to structured JSON", async () => {
    resetStub();
    stubThrow = {
      method: "remove",
      error: new HttpError(422, "Owner cannot remove themselves", "OWNER_CANNOT_SELF_REMOVE"),
    };
    const app = buildApp();
    const token = signMember({
      userId: "u-owner",
      email: "o@x.com",
      vendorId: "v-1",
      role: "owner",
    });

    const res = await app.handle(
      new Request("http://localhost/vendors/v-1/members/m-owner", {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
      }),
    );

    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string; statusCode: number };
    expect(body.error).toBe("OWNER_CANNOT_SELF_REMOVE");
    expect(body.statusCode).toBe(422);
  });
});

// ─── POST /vendors/:vendorId/members/:memberId/resend ────────────────────────

describe("POST /vendors/:vendorId/members/:memberId/resend", () => {
  test("owner can resend invite — 200, service called with right args", async () => {
    resetStub();
    const app = buildApp();
    const token = signMember({
      userId: "u-owner",
      email: "o@x.com",
      vendorId: "v-1",
      role: "owner",
    });

    const res = await app.handle(
      new Request("http://localhost/vendors/v-1/members/m-pending/resend", {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      }),
    );

    expect(res.status).toBe(200);
    expect(stubCalls.resendInvite).toHaveLength(1);
    expect(stubCalls.resendInvite[0]).toMatchObject({
      vendorId: "v-1",
      memberId: "m-pending",
      actorUserId: "u-owner",
    });
  });
});

// ─── POST /vendors/:vendorId/members/transfer-ownership ──────────────────────

describe("POST /vendors/:vendorId/members/transfer-ownership", () => {
  test("owner can transfer — 200, service called with right args", async () => {
    resetStub();
    const app = buildApp();
    const token = signMember({
      userId: "u-owner",
      email: "o@x.com",
      vendorId: "v-1",
      role: "owner",
    });

    const res = await app.handle(
      new Request("http://localhost/vendors/v-1/members/transfer-ownership", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ targetMemberId: "m-target" }),
      }),
    );

    expect(res.status).toBe(200);
    expect(stubCalls.transferOwnership).toHaveLength(1);
    expect(stubCalls.transferOwnership[0]).toMatchObject({
      vendorId: "v-1",
      currentOwnerUserId: "u-owner",
      targetMemberId: "m-target",
    });
  });

  test("manager forbidden — 403 for transfer-ownership (lacks team.write)", async () => {
    resetStub();
    const app = buildApp();
    const token = signMember({
      userId: "u-mgr",
      email: "mgr@x.com",
      vendorId: "v-1",
      role: "manager",
    });

    const res = await app.handle(
      new Request("http://localhost/vendors/v-1/members/transfer-ownership", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ targetMemberId: "m-target" }),
      }),
    );

    expect(res.status).toBe(403);
    expect(stubCalls.transferOwnership).toHaveLength(0);
  });
});
