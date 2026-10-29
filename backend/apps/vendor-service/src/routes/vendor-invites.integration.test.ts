/**
 * Route-wiring tests for /vendor-members/* invitee-side (Task B10, Phase 3a).
 *
 * Verifies public vs authed gating, HttpError → JSON mapping, and the
 * INVITE_EMAIL_MISMATCH special-case body augmentation.
 *
 * Strategy: mock.module(containerAbsPath, ...) replaces the Elysia container
 * with a stub that decorates `vendorMemberService`. AppDataSource.getRepository
 * is patched in-place to intercept the User lookup in the accept route.
 */
import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import { createHmac } from "node:crypto";
import { config } from "@materialhub/config";
import { HttpError } from "@materialhub/plugins";
import { Elysia } from "elysia";

// ─── Stub state ───────────────────────────────────────────────────────────────

interface StubServiceCalls {
  previewInvite: unknown[];
  acceptInvite: unknown[];
  declineInvite: unknown[];
}

let stubCalls: StubServiceCalls = {
  previewInvite: [],
  acceptInvite: [],
  declineInvite: [],
};

let stubBehavior: {
  preview?: unknown | null;
  acceptThrow?: HttpError;
  declineThrow?: HttpError;
} = {};

function resetStubs() {
  stubCalls = { previewInvite: [], acceptInvite: [], declineInvite: [] };
  stubBehavior = {};
}

const defaultPreview = {
  vendorName: "Acme",
  role: "manager",
  invitedEmail: "invitee@x.com",
  expiresAt: "2099-01-01T00:00:00Z",
  status: "pending",
  expired: false,
};

// ─── Mock container BEFORE importing routes ───────────────────────────────────
// Same pattern as vendor-members.integration.test.ts (Task B8).
const containerAbsPath = `${import.meta.dir}/../container.ts`;

mock.module(containerAbsPath, () => ({
  container: new Elysia({ name: "vendor-service-container" })
    .decorate("vendorMemberService", {
      previewInvite: async (token: string) => {
        stubCalls.previewInvite.push({ token });
        return stubBehavior.preview === undefined ? defaultPreview : stubBehavior.preview;
      },
      acceptInvite: async (args: unknown) => {
        stubCalls.acceptInvite.push(args);
        if (stubBehavior.acceptThrow) throw stubBehavior.acceptThrow;
      },
      declineInvite: async (token: string) => {
        stubCalls.declineInvite.push({ token });
        if (stubBehavior.declineThrow) throw stubBehavior.declineThrow;
      },
    })
    .decorate("emailService", { sendVendorMemberInviteEmail: async () => {} }),
}));

// ─── Patch AppDataSource.getRepository for User email_verified_at lookup ─────
// The accept route calls AppDataSource.getRepository(User).findOne(...)
// to determine emailVerified. We intercept only the User entity.
import { AppDataSource } from "@materialhub/database";

const originalGetRepo = AppDataSource.getRepository.bind(AppDataSource);

// biome-ignore lint/suspicious/noExplicitAny: test-only stub object
let userFindOneResult: any = { id: "u-authed", email_verified_at: new Date() };

// biome-ignore lint/complexity/noBannedTypes: matching TypeORM's entity argument type
(AppDataSource as any).getRepository = (entity: Function) => {
  if (entity?.name === "User") {
    return {
      findOne: async () => userFindOneResult,
    };
  }
  return originalGetRepo(entity as never);
};

// ─── Dynamic import AFTER mock.module ─────────────────────────────────────────
// Static imports are hoisted above mock.module — dynamic import ensures the
// stub container is in place before the route module binds it.
const { vendorInvitesRoutes } = await import("./vendor-invites.routes.ts");

// ─── JWT minter (same hand-rolled HS256 as Task B8) ──────────────────────────
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

// Sign a token for an ordinary (non-vendor) user, omitting `tv` so jwtAuth
// skips the Redis/DB token-version revocation check entirely.
function signCustomer(opts: { userId: string; email: string }): string {
  return signHs256(
    { sub: opts.userId, email: opts.email, role: "customer" },
    config.jwt.accessSecret,
  );
}

// ─── Build test app ───────────────────────────────────────────────────────────

// biome-ignore lint/suspicious/noExplicitAny: Elysia's generic chain makes exact typing impractical in tests
function buildApp(): any {
  // biome-ignore lint/suspicious/noExplicitAny: test-only cast
  return new Elysia().use(vendorInvitesRoutes as any);
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeAll(() => {
  // No permissionMatrix seeding needed — invitee routes have no vendorMembership gate.
  userFindOneResult = { id: "u-authed", email_verified_at: new Date() };
});

afterEach(() => {
  resetStubs();
  userFindOneResult = { id: "u-authed", email_verified_at: new Date() };
});

// ─── GET /vendor-members/invite/:token (public) ───────────────────────────────

describe("GET /vendor-members/invite/:token (public)", () => {
  test("returns preview without auth — 200, service called with token", async () => {
    const app = buildApp();
    const res = await app.handle(new Request("http://localhost/vendor-members/invite/tok-1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: typeof defaultPreview };
    expect(body.data.vendorName).toBe("Acme");
    expect(stubCalls.previewInvite).toHaveLength(1);
    expect((stubCalls.previewInvite[0] as { token: string }).token).toBe("tok-1");
  });

  test("returns 404 INVITE_NOT_FOUND when service returns null", async () => {
    stubBehavior.preview = null;
    const app = buildApp();
    const res = await app.handle(new Request("http://localhost/vendor-members/invite/bad-tok"));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("INVITE_NOT_FOUND");
  });
});

// ─── POST /vendor-members/decline (public) ────────────────────────────────────

describe("POST /vendor-members/decline (public)", () => {
  test("works without auth — 200, service called with token", async () => {
    const app = buildApp();
    const res = await app.handle(
      new Request("http://localhost/vendor-members/decline", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: "tok-1" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(stubCalls.declineInvite).toHaveLength(1);
    expect((stubCalls.declineInvite[0] as { token: string }).token).toBe("tok-1");
  });

  test("404 INVITE_NOT_FOUND from service maps to structured JSON", async () => {
    stubBehavior.declineThrow = new HttpError(404, "Invite not found", "INVITE_NOT_FOUND");
    const app = buildApp();
    const res = await app.handle(
      new Request("http://localhost/vendor-members/decline", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: "bad-tok" }),
      }),
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string; statusCode: number };
    expect(body.error).toBe("INVITE_NOT_FOUND");
    expect(body.statusCode).toBe(404);
  });

  test("410 INVITE_EXPIRED from service maps correctly", async () => {
    stubBehavior.declineThrow = new HttpError(410, "Invite has expired", "INVITE_EXPIRED");
    const app = buildApp();
    const res = await app.handle(
      new Request("http://localhost/vendor-members/decline", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: "expired-tok" }),
      }),
    );
    expect(res.status).toBe(410);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("INVITE_EXPIRED");
  });
});

// ─── POST /vendor-members/accept (auth required) ──────────────────────────────

describe("POST /vendor-members/accept (auth required)", () => {
  test("no token returns 401", async () => {
    const app = buildApp();
    const res = await app.handle(
      new Request("http://localhost/vendor-members/accept", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: "tok-1" }),
      }),
    );
    expect(res.status).toBe(401);
    // Service must not be called
    expect(stubCalls.acceptInvite).toHaveLength(0);
  });

  test("authed call: service receives correct args, 200 success", async () => {
    const jwtToken = signCustomer({ userId: "u-authed", email: "invitee@x.com" });
    const app = buildApp();
    const res = await app.handle(
      new Request("http://localhost/vendor-members/accept", {
        method: "POST",
        headers: {
          authorization: `Bearer ${jwtToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ token: "tok-1" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(stubCalls.acceptInvite).toHaveLength(1);
    expect(stubCalls.acceptInvite[0]).toMatchObject({
      token: "tok-1",
      authedUserId: "u-authed",
      authedEmail: "invitee@x.com",
      emailVerified: true,
    });
  });

  test("emailVerified=false when User.email_verified_at is null", async () => {
    userFindOneResult = { id: "u-authed", email_verified_at: null };
    const jwtToken = signCustomer({ userId: "u-authed", email: "invitee@x.com" });
    const app = buildApp();
    await app.handle(
      new Request("http://localhost/vendor-members/accept", {
        method: "POST",
        headers: {
          authorization: `Bearer ${jwtToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ token: "tok-1" }),
      }),
    );
    expect(stubCalls.acceptInvite).toHaveLength(1);
    expect((stubCalls.acceptInvite[0] as { emailVerified: boolean }).emailVerified).toBe(false);
  });

  test("INVITE_EMAIL_MISMATCH attaches inviteEmail + authedEmail to response body", async () => {
    stubBehavior.acceptThrow = new HttpError(
      409,
      "Invite is for a different email",
      "INVITE_EMAIL_MISMATCH",
    );
    stubBehavior.preview = {
      ...defaultPreview,
      invitedEmail: "real-invitee@x.com",
    };
    const jwtToken = signCustomer({ userId: "u-wrong", email: "wrong-user@x.com" });
    const app = buildApp();
    const res = await app.handle(
      new Request("http://localhost/vendor-members/accept", {
        method: "POST",
        headers: {
          authorization: `Bearer ${jwtToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ token: "tok-1" }),
      }),
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as {
      error: string;
      inviteEmail: string;
      authedEmail: string;
    };
    expect(body.error).toBe("INVITE_EMAIL_MISMATCH");
    expect(body.inviteEmail).toBe("real-invitee@x.com");
    expect(body.authedEmail).toBe("wrong-user@x.com");
    // previewInvite should have been called a second time (for augmentation)
    expect(stubCalls.previewInvite).toHaveLength(1);
  });

  test("INVITE_EXPIRED maps to 410 plain JSON — no inviteEmail augmentation", async () => {
    stubBehavior.acceptThrow = new HttpError(410, "Invite has expired", "INVITE_EXPIRED");
    const jwtToken = signCustomer({ userId: "u-authed", email: "invitee@x.com" });
    const app = buildApp();
    const res = await app.handle(
      new Request("http://localhost/vendor-members/accept", {
        method: "POST",
        headers: {
          authorization: `Bearer ${jwtToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ token: "tok-1" }),
      }),
    );
    expect(res.status).toBe(410);
    const body = (await res.json()) as { error: string; inviteEmail?: string };
    expect(body.error).toBe("INVITE_EXPIRED");
    expect(body.inviteEmail).toBeUndefined();
    // previewInvite should NOT have been called (no augmentation for INVITE_EXPIRED)
    expect(stubCalls.previewInvite).toHaveLength(0);
  });
});
