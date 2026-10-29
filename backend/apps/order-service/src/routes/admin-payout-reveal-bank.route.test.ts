/**
 * Route-wiring test for POST /admin/payouts/:id/reveal-bank.
 *
 * The controller (unit-tested in admin-payout.controller.test.ts) writes an
 * awaited, guaranteed `payout.bank_details_revealed` audit row on every
 * reveal. auditPlugin ALSO auto-captures every non-GET /admin request that
 * doesn't set `audit.skip` — without the route setting it, a second,
 * untracked, plugin-inferred row (`payouts.reveal-bank`) would be persisted
 * for the single most sensitive action in the system. This file proves the
 * route's `audit.skip = true` actually suppresses that second write, by
 * importing the REAL admin-payout.routes.ts (with the real jwtAuth,
 * requireRole and auditPlugin) rather than re-implementing the handler.
 *
 * Strategy mirrors order-item-cancellation.route.test.ts: mock.module("../container.ts")
 * injects a stub adminPayoutController so no real DB is touched, and
 * AppDataSource.getRepository is stubbed to capture auditPlugin's own
 * fire-and-forget writes (a separate code path from the controller's own
 * auditLogRepo, which this stub does not exercise — that's covered by the
 * controller unit tests).
 */
import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { createHmac } from "node:crypto";
import { config } from "@materialhub/config";
import { AppDataSource } from "@materialhub/database";
import { Elysia } from "elysia";

const revealBankResult = {
  account_holder_name: "Acme Perfumes LLC",
  bank_name: "Emirates NBD",
  account_number: "1234567890",
  iban: "AE070331234567890123456",
  swift_code: "EBILAEAD",
  currency: "AED",
  account_deleted: false,
};

const calls: { revealBank: any[] } = { revealBank: [] };

const adminPayoutControllerStub = {
  async revealBank(id: string, actor: { id: string; role: string }) {
    calls.revealBank.push({ id, actor });
    return revealBankResult;
  },
};

// Relative specifier (matches how admin-payout.routes.ts imports it and how
// order-item-cancellation.route.test.ts mocks its own container) — an
// absolute import.meta.dir path fails to match the resolved module on Linux
// CI, letting the real container (which needs a live DB) run instead.
mock.module("../container.ts", () => ({
  container: new Elysia({ name: "order-service-container" }).decorate(
    "adminPayoutController",
    adminPayoutControllerStub,
  ),
}));

// auditPlugin's onAfterHandle writes fire-and-forget via
// AppDataSource.getRepository(AuditLog).save — capture calls here. This is a
// SEPARATE write path from the controller's own auditLogRepo.save (which the
// controller stub above does not touch), so a call captured here can only
// have come from the plugin's auto-capture, not the controller.
const pluginAuditSaves: any[] = [];
const origGetRepository = (AppDataSource as any).getRepository;
(AppDataSource as any).getRepository = () => ({
  create: (x: any) => x,
  save: async (row: any) => {
    pluginAuditSaves.push(row);
    return row;
  },
});

afterAll(() => {
  (AppDataSource as any).getRepository = origGetRepository;
  mock.restore();
});

const { adminPayoutRoutes } = await import("./admin-payout.routes.ts");

// ─── JWT minter (mirrors order-item-cancellation.route.test.ts) ──────────
function b64url(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf) : buf;
  return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
function sign(role: string, userId = "sa-1"): string {
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
  // bun test shares one module cache across files: if a sibling test (e.g.
  // admin-payout-adjustment.integration.test.ts) imported admin-payout.routes.ts
  // first, that plugin already captured ITS container stub, which has no
  // adminPayoutController. Decorating the stub on the outer app as well makes
  // the handler resolve this file's stub in either load order.
  return new Elysia()
    .decorate("adminPayoutController", adminPayoutControllerStub)
    .use(adminPayoutRoutes as any);
}

const PAYOUT_ID = "11111111-1111-4111-8111-111111111111";

function req(method: string, path: string, token: string | undefined): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

beforeEach(() => {
  calls.revealBank = [];
  pluginAuditSaves.length = 0;
});

describe("POST /admin/payouts/:id/reveal-bank", () => {
  test("super_admin reaches the controller and gets 200 with the revealed details", async () => {
    const res = await app().handle(
      req("POST", `/admin/payouts/${PAYOUT_ID}/reveal-bank`, sign("super_admin")),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.data).toEqual(revealBankResult);

    expect(calls.revealBank.length).toBe(1);
    expect(calls.revealBank[0].id).toBe(PAYOUT_ID);
    expect(calls.revealBank[0].actor).toEqual({ id: "sa-1", role: "super_admin" });
  });

  // The controller writes exactly one audit row per reveal (see
  // admin-payout.controller.test.ts). This proves the route itself does not
  // add a second, untracked one. Removing `audit.skip = true` from the route
  // handler would make auditPlugin auto-infer and persist its own row here,
  // turning `pluginAuditSaves.length` from 0 to 1 and failing this test —
  // that is the exact regression this test exists to catch.
  test("does not let auditPlugin auto-capture a second, untracked audit row", async () => {
    const res = await app().handle(
      req("POST", `/admin/payouts/${PAYOUT_ID}/reveal-bank`, sign("super_admin")),
    );
    expect(res.status).toBe(200);
    expect(pluginAuditSaves.length).toBe(0);
  });

  test("rejects unauthenticated requests without reaching the controller", async () => {
    const res = await app().handle(
      req("POST", `/admin/payouts/${PAYOUT_ID}/reveal-bank`, undefined),
    );
    expect(res.status).toBe(401);
    expect(calls.revealBank.length).toBe(0);
  });

  // Note: a guard-level rejection (never reaching the route handler) still
  // gets auditPlugin's own inferred row here — that's pre-existing behaviour
  // shared by every route in this file (audit.skip is only ever set INSIDE a
  // handler, so a request that never reaches one can't skip), not something
  // this task's fix changes or is scoped to. Only the *successful* path
  // (asserted above) is where the controller's row and the route's
  // `audit.skip` both apply, which is what Important 2 was about.
  test("rejects a customer role without reaching the controller", async () => {
    const res = await app().handle(
      req("POST", `/admin/payouts/${PAYOUT_ID}/reveal-bank`, sign("customer")),
    );
    expect(res.status).toBe(403);
    expect(calls.revealBank.length).toBe(0);
  });
});
