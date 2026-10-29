import { beforeEach, describe, expect, it, mock } from "bun:test";
import { AdminPayoutApproveBody, AdminPayoutStatusBody } from "@materialhub/dto";
import { Elysia, t } from "elysia";

// In-process route tests — no real DB, Redis, BullMQ, or auth guards.
// Handler logic is inlined here (mirroring shipping-rate-admin.integration.test.ts)
// so that jwtAuth / requireRole do not reject the synthetic user context.
// Guards are covered by the guards lib tests.

type PayoutRow = {
  id: string;
  vendor_id: string;
  payout_reference: string;
  period_start: string;
  period_end: string;
  gross_amount: number;
  commission_total: number;
  adjustment_total: number;
  carrier_cost_total: number;
  net_amount: number;
  currency: string;
  status: "pending" | "processing" | "paid" | "failed";
  payout_rail: "manual_bank_transfer" | "stripe_connect" | null;
  gateway_reference: string | null;
  notes: string | null;
  processed_at: Date | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

type AuditRow = {
  id: string;
  action: string;
  actor_id: string | null;
  actor_role: string;
  entity_type: string;
  entity_id: string | null;
  changes: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
};

function makePayout(o: Partial<PayoutRow> = {}): PayoutRow {
  const now = new Date();
  return {
    id: o.id ?? "pay-1",
    vendor_id: o.vendor_id ?? "vendor-1",
    payout_reference: o.payout_reference ?? "PAY-2026-000001",
    period_start: o.period_start ?? "2026-04-01",
    period_end: o.period_end ?? "2026-04-30",
    gross_amount: o.gross_amount ?? 100000,
    commission_total: o.commission_total ?? 10000,
    adjustment_total: o.adjustment_total ?? 0,
    carrier_cost_total: o.carrier_cost_total ?? 5000,
    net_amount: o.net_amount ?? 85000,
    currency: o.currency ?? "AED",
    status: o.status ?? "processing",
    payout_rail: o.payout_rail ?? null,
    // `?? "tr_test123"` would have swallowed an explicit null, which is
    // exactly the state R4-C1's void operation is defined on.
    gateway_reference: "gateway_reference" in o ? (o.gateway_reference ?? null) : "tr_test123",
    notes: o.notes ?? null,
    processed_at: o.processed_at ?? null,
    created_at: o.created_at ?? now,
    updated_at: o.updated_at ?? now,
    deleted_at: o.deleted_at ?? null,
  };
}

function makeAuditRow(o: Partial<AuditRow> = {}): AuditRow {
  return {
    id: o.id ?? "audit-1",
    action: o.action ?? "payout.status_changed",
    actor_id: o.actor_id ?? "admin-1",
    actor_role: o.actor_role ?? "admin",
    entity_type: o.entity_type ?? "vendor_payout",
    entity_id: o.entity_id ?? "pay-1",
    changes: o.changes ?? null,
    metadata: o.metadata ?? null,
    created_at: o.created_at ?? new Date(),
  };
}

function makePayoutRepo(rows: PayoutRow[]) {
  return {
    find: mock(async (opts: any) => rows.filter((r) => !r.deleted_at)),
    findOne: mock(async (opts: any) => {
      const id = opts?.where?.id;
      return rows.find((r) => r.id === id && !r.deleted_at) ?? null;
    }),
    save: mock(async (partial: any) => {
      const existing = rows.find((r) => r.id === partial.id);
      if (existing) {
        Object.assign(existing, partial, { updated_at: new Date() });
        return existing;
      }
      const row = makePayout({ ...partial, id: partial.id ?? `pay-${rows.length + 1}` });
      rows.push(row);
      return row;
    }),
    count: mock(async (opts: any) => {
      const status = opts?.where?.status;
      return rows.filter((r) => !r.deleted_at && (!status || r.status === status)).length;
    }),
    createQueryBuilder: mock(() => {
      const state = { _filters: [] as ((r: PayoutRow) => boolean)[], _skip: 0, _take: 20 };
      const builder: any = {
        leftJoinAndSelect: function () {
          return this;
        },
        orderBy: function () {
          return this;
        },
        addOrderBy: function () {
          return this;
        },
        skip: function (n: number) {
          state._skip = n;
          return this;
        },
        take: function (n: number) {
          state._take = n;
          return this;
        },
        andWhere: function (cond: string, params?: Record<string, unknown>) {
          if (cond.includes("p.vendor_id") && params?.vendorId) {
            state._filters.push((r) => r.vendor_id === params.vendorId);
          }
          if (cond.includes("p.status") && params?.status) {
            state._filters.push((r) => r.status === params.status);
          }
          return this;
        },
        getManyAndCount: async () => {
          const filtered = rows
            .filter((r) => !r.deleted_at)
            .filter((r) => state._filters.every((f) => f(r)));
          return [filtered.slice(state._skip, state._skip + state._take), filtered.length];
        },
        getMany: async () => rows.filter((r) => !r.deleted_at),
      };
      return builder;
    }),
  };
}

function makeAuditRepo(rows: AuditRow[]) {
  return {
    find: mock(async (opts: any) => {
      const entityType = opts?.where?.entity_type;
      const entityId = opts?.where?.entity_id;
      return rows.filter(
        (r) =>
          (!entityType || r.entity_type === entityType) && (!entityId || r.entity_id === entityId),
      );
    }),
    save: mock(async (partial: any) => {
      const row = makeAuditRow({ ...partial, id: `audit-${rows.length + 1}` });
      rows.push(row);
      return row;
    }),
    create: mock((partial: any) => partial),
  };
}

const ok = (data: unknown, extra: Record<string, unknown> = {}) => ({
  statusCode: 200,
  data,
  timestamp: new Date().toISOString(),
  ...extra,
});
const errResp = (status: number, error: string, message: string) => ({
  statusCode: status,
  error,
  message,
  timestamp: new Date().toISOString(),
});

// ---------------------------------------------------------------------------
// App builders — one per behaviour category
// ---------------------------------------------------------------------------

function buildAdminApp(payoutRows: PayoutRow[] = [], auditRows: AuditRow[] = []) {
  const payoutRepo = makePayoutRepo(payoutRows);
  const auditRepo = makeAuditRepo(auditRows);

  // Inline the controller so we don't pull in real container/BullMQ
  const adminPayoutController = {
    async list(filters: any) {
      const page = filters.page ?? 1;
      const limit = filters.limit ?? 20;
      const qb = (payoutRepo.createQueryBuilder as any)();
      qb.leftJoinAndSelect("p.vendor", "vendor")
        .orderBy("p.created_at", "DESC")
        .skip((page - 1) * limit)
        .take(limit);
      if (filters.vendorId) qb.andWhere("p.vendor_id = :vendorId", { vendorId: filters.vendorId });
      if (filters.status) qb.andWhere("p.status = :status", { status: filters.status });
      const [rows, total] = await qb.getManyAndCount();
      const items = rows.map((p: PayoutRow) => ({ ...p, vendor_name: "Test Vendor" }));
      return { items, total };
    },
    async summary() {
      const processing_count = await payoutRepo.count({ where: { status: "processing" } });
      const failed_count = await payoutRepo.count({ where: { status: "failed" } });
      return {
        total_pending_fils: 0,
        paid_this_month_fils: 0,
        processing_count,
        failed_count,
      };
    },
    async get(id: string) {
      const payout = await payoutRepo.findOne({ where: { id } });
      if (!payout) {
        const err: any = new Error("Payout not found");
        err.statusCode = 404;
        throw err;
      }
      return payout;
    },
    async getTimeline(id: string) {
      return auditRepo.find({
        where: { entity_type: "vendor_payout", entity_id: id },
        order: { created_at: "ASC" },
      });
    },
    async changeStatus(
      id: string,
      adminUserId: string,
      body: { status: "paid" | "failed"; notes?: string; reference?: string },
    ) {
      const payout = await payoutRepo.findOne({ where: { id } });
      if (!payout) throw new Error("Payout not found");
      if (payout.status !== "processing") throw new Error("Payout must be in 'processing'");
      // Mirrors PayoutService.markPaid: on the manual rail nothing wrote a
      // gateway_reference (no Stripe call happened), so the operator's bank
      // reference is the only evidence the money left.
      if (body.status === "paid" && payout.payout_rail === "manual_bank_transfer") {
        if (!body.reference || !body.reference.trim()) {
          throw Object.assign(
            new Error("a bank reference is required when marking a manual payout as paid"),
            { code: "PAYOUT_REFERENCE_REQUIRED" },
          );
        }
        payout.gateway_reference = body.reference.trim();
      }
      const oldStatus = payout.status;
      payout.status = body.status;
      if (body.status === "paid") payout.processed_at = new Date();
      if (body.notes) payout.notes = body.notes;
      const updated = await payoutRepo.save(payout);
      await auditRepo.save(
        auditRepo.create({
          action: "payout.status_changed",
          actor_id: adminUserId,
          actor_role: "admin",
          entity_type: "vendor_payout",
          entity_id: id,
          changes: { status: { old: oldStatus, new: body.status } },
          metadata:
            body.notes || body.reference
              ? {
                  ...(body.notes ? { note: body.notes } : {}),
                  ...(body.reference ? { bank_reference: body.reference.trim() } : {}),
                }
              : null,
        }),
      );
      return updated;
    },
    async addNote(id: string, adminUserId: string, note: string) {
      const payout = await payoutRepo.findOne({ where: { id } });
      if (!payout) throw new Error("Payout not found");
      payout.notes = note;
      const updated = await payoutRepo.save(payout);
      await auditRepo.save(
        auditRepo.create({
          action: "payout.note_added",
          actor_id: adminUserId,
          actor_role: "admin",
          entity_type: "vendor_payout",
          entity_id: id,
          metadata: { note },
        }),
      );
      return updated;
    },
    // generate is tested separately (no real BullMQ); just expose a stub
    async generate(_adminUserId: string, _body: any) {
      throw Object.assign(new Error("Vendor has no pending commissions"), { code: "NO_PENDING" });
    },
    // approve/reject mirror AdminPayoutController's real translation: a
    // not-found payout is a 404, a not-pending payout is a 409 (PAYOUT_NOT_DRAFT).
    //
    // Mirrors PayoutService.approveDraft's rail dispatch: manual_bank_transfer
    // moves the row straight to `processing` synchronously and enqueues
    // nothing (jobId stays null — there is no Stripe call on this rail);
    // stripe_connect leaves it `pending` and enqueues a transfer job.
    async approve(
      id: string,
      adminUserId: string,
      rail: "manual_bank_transfer" | "stripe_connect",
    ) {
      const payout = await payoutRepo.findOne({ where: { id } });
      if (!payout) throw Object.assign(new Error("Payout not found"), { statusCode: 404 });
      if (payout.status !== "pending") {
        throw Object.assign(new Error("Only pending drafts can be approved"), {
          code: "PAYOUT_NOT_DRAFT",
        });
      }
      payout.payout_rail = rail;
      payout.status = rail === "manual_bank_transfer" ? "processing" : "pending";
      await payoutRepo.save(payout);
      const jobId = rail === "manual_bank_transfer" ? null : "job-fake";
      await auditRepo.save(
        auditRepo.create({
          action:
            rail === "manual_bank_transfer" ? "payout.paid_manually_initiated" : "payout.approved",
          actor_id: adminUserId,
          actor_role: "admin",
          entity_type: "vendor_payout",
          entity_id: id,
          metadata: { job_id: jobId, payout_rail: rail },
        }),
      );
      return { jobId, rail };
    },
    async reject(id: string, adminUserId: string, reason: string) {
      const payout = await payoutRepo.findOne({ where: { id } });
      if (!payout) throw Object.assign(new Error("Payout not found"), { statusCode: 404 });
      if (payout.status !== "pending") {
        throw Object.assign(new Error("Only pending drafts can be rejected"), {
          code: "PAYOUT_NOT_DRAFT",
        });
      }
      await auditRepo.save(
        auditRepo.create({
          action: "payout.draft_rejected",
          actor_id: adminUserId,
          actor_role: "admin",
          entity_type: "vendor_payout",
          entity_id: id,
          metadata: { reason },
        }),
      );
    },
    // R4-C1 — void mirrors AdminPayoutController.void + PayoutService
    // .voidFailedPayout's refusals: 404 unknown, 409 PAYOUT_NOT_VOIDABLE for
    // the wrong status OR a payout that already carries a gateway_reference.
    async void(id: string, adminUserId: string, reason: string) {
      const payout = await payoutRepo.findOne({ where: { id } });
      if (!payout) throw Object.assign(new Error("Payout not found"), { statusCode: 404 });
      if (payout.status !== "failed" || payout.gateway_reference != null) {
        throw Object.assign(new Error("Only failed payouts with no transfer can be voided"), {
          code: "PAYOUT_NOT_VOIDABLE",
        });
      }
      await auditRepo.save(
        auditRepo.create({
          action: "payout.voided",
          actor_id: adminUserId,
          actor_role: "admin",
          entity_type: "vendor_payout",
          entity_id: id,
          metadata: { reason },
        }),
      );
    },
  };

  const app = new Elysia()
    .decorate("adminPayoutController", adminPayoutController)
    .derive(() => ({ user: { id: "admin-1", role: "admin" } }))
    // LIST
    .get(
      "/admin/payouts",
      async ({ query, adminPayoutController: ctrl }: any) => {
        const result = await ctrl.list(query);
        return {
          statusCode: 200,
          data: result.items,
          total: result.total,
          timestamp: new Date().toISOString(),
        };
      },
      {
        query: t.Object({
          vendorId: t.Optional(t.String()),
          status: t.Optional(t.String()),
          page: t.Optional(t.Integer({ minimum: 1, default: 1 })),
          limit: t.Optional(t.Integer({ minimum: 1, maximum: 100, default: 20 })),
        }),
      },
    )
    // SUMMARY
    .get("/admin/payouts/summary", async ({ adminPayoutController: ctrl }: any) => {
      const data = await ctrl.summary();
      return ok(data);
    })
    // GET ONE
    .get(
      "/admin/payouts/:id",
      async ({ params, adminPayoutController: ctrl, set }: any) => {
        try {
          const data = await ctrl.get(params.id);
          return ok(data);
        } catch (e: any) {
          set.status = e.statusCode ?? 400;
          return errResp(e.statusCode ?? 400, "NOT_FOUND", e.message);
        }
      },
      { params: t.Object({ id: t.String() }) },
    )
    // TIMELINE
    .get(
      "/admin/payouts/:id/timeline",
      async ({ params, adminPayoutController: ctrl }: any) => {
        const data = await ctrl.getTimeline(params.id);
        return ok(data);
      },
      { params: t.Object({ id: t.String() }) },
    )
    // GENERATE (returns 400 when no pending commissions)
    .post(
      "/admin/payouts/generate",
      async ({ body, user, adminPayoutController: ctrl }: any) => {
        try {
          const data = await ctrl.generate(user.id, body);
          return ok(data);
        } catch (err: any) {
          const status = err.code === "PAYOUT_DUPLICATE" ? 409 : 400;
          return new Response(
            JSON.stringify({
              statusCode: status,
              message: err.message,
              error: err.code ?? "BadRequest",
              timestamp: new Date().toISOString(),
            }),
            { status, headers: { "content-type": "application/json" } },
          );
        }
      },
      {
        body: t.Object({
          vendorId: t.String({ format: "uuid" }),
          periodStart: t.String(),
          periodEnd: t.String(),
        }),
      },
    )
    // PATCH STATUS
    .patch(
      "/admin/payouts/:id/status",
      async ({ params, body, user, adminPayoutController: ctrl, set }: any) => {
        try {
          const data = await ctrl.changeStatus(params.id, user.id, body);
          return ok(data);
        } catch (e: any) {
          set.status = 400;
          return errResp(400, "BadRequest", e.message);
        }
      },
      {
        params: t.Object({ id: t.String() }),
        // Real DTO, not a hand-copied subset — a field this route needs
        // (like `reference`) must be declared here or Elysia silently
        // strips it before the handler ever sees it.
        body: AdminPayoutStatusBody,
      },
    )
    // POST NOTE
    .post(
      "/admin/payouts/:id/notes",
      async ({ params, body, user, adminPayoutController: ctrl }: any) => {
        const data = await ctrl.addNote(params.id, user.id, body.note);
        return ok(data);
      },
      {
        params: t.Object({ id: t.String() }),
        body: t.Object({ note: t.String({ minLength: 1 }) }),
      },
    )
    // APPROVE — the only path that queues a transfer of a draft's stored figures
    .post(
      "/admin/payouts/:id/approve",
      async ({ params, body, user, adminPayoutController: ctrl, set }: any) => {
        try {
          const data = await ctrl.approve(params.id, user.id, body.rail);
          set.status = 202;
          return { statusCode: 202, data, timestamp: new Date().toISOString() };
        } catch (e: any) {
          const status = e.statusCode ?? (e.code === "PAYOUT_NOT_DRAFT" ? 409 : 400);
          set.status = status;
          return errResp(status, e.code ?? "BadRequest", e.message);
        }
      },
      // Real DTO: `rail` is required, no default — how a vendor gets paid is
      // an explicit per-payment decision. Without declaring it here Elysia
      // strips it and the fake ctrl.approve above silently receives
      // `undefined`, which is exactly the scaffolding gap this task fixes:
      // the old inline route took no body at all and called the two-arg
      // ctrl.approve(id, adminUserId), so this suite passed while the real
      // route (which now requires `rail`) would have 422'd.
      { params: t.Object({ id: t.String() }), body: AdminPayoutApproveBody },
    )
    // REJECT — releases a draft's claims and soft-deletes it
    .post(
      "/admin/payouts/:id/reject",
      async ({ params, body, user, adminPayoutController: ctrl, set }: any) => {
        try {
          await ctrl.reject(params.id, user.id, body.reason);
          return { statusCode: 200, data: { ok: true }, timestamp: new Date().toISOString() };
        } catch (e: any) {
          const status = e.statusCode ?? (e.code === "PAYOUT_NOT_DRAFT" ? 409 : 400);
          set.status = status;
          return errResp(status, e.code ?? "BadRequest", e.message);
        }
      },
      {
        params: t.Object({ id: t.String() }),
        body: t.Object({ reason: t.String({ minLength: 1, maxLength: 500 }) }),
      },
    )
    // VOID — releases a failed payout that never sent money
    .post(
      "/admin/payouts/:id/void",
      async ({ params, body, user, adminPayoutController: ctrl, set }: any) => {
        try {
          await ctrl.void(params.id, user.id, body.reason);
          return { statusCode: 200, data: { ok: true }, timestamp: new Date().toISOString() };
        } catch (e: any) {
          const status = e.statusCode ?? (e.code === "PAYOUT_NOT_VOIDABLE" ? 409 : 400);
          set.status = status;
          return errResp(status, e.code ?? "BadRequest", e.message);
        }
      },
      {
        params: t.Object({ id: t.String() }),
        body: t.Object({ reason: t.String({ minLength: 1, maxLength: 500 }) }),
      },
    );

  return { app, payoutRepo, auditRepo };
}

// An app that has NO user context — simulates unauthenticated requests.
// Guards are bypassed here too, but we wire a guard-like beforeHandle that
// always rejects so 401 behaviour is exercised.
function buildUnauthApp() {
  return new Elysia()
    .onBeforeHandle(
      () =>
        new Response(JSON.stringify({ statusCode: 401, error: "Unauthorized" }), { status: 401 }),
    )
    .get("/admin/payouts", () => ({ data: [] }));
}

// An app where the user has role = "vendor" — simulates non-admin.
function buildVendorRoleApp() {
  return new Elysia()
    .derive(() => ({ user: { id: "vendor-1", role: "vendor" } }))
    .onBeforeHandle(({ user }: any) => {
      const allowed = ["admin", "super_admin"];
      if (!allowed.includes(user?.role)) {
        return new Response(JSON.stringify({ statusCode: 403, error: "Forbidden" }), {
          status: 403,
        });
      }
    })
    .get("/admin/payouts", () => ({ data: [] }))
    .post("/admin/payouts/:id/approve", () => ({ data: {} }))
    .post("/admin/payouts/:id/reject", () => ({ data: {} }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("admin-payout.routes", () => {
  let payoutRows: PayoutRow[];
  let auditRows: AuditRow[];

  beforeEach(() => {
    payoutRows = [
      makePayout({ id: "pay-1", status: "processing", vendor_id: "vendor-1" }),
      makePayout({ id: "pay-2", status: "paid", vendor_id: "vendor-2" }),
    ];
    auditRows = [];
  });

  // -------------------------------------------------------------------------
  // Auth
  // -------------------------------------------------------------------------

  it("GET /admin/payouts → 401 when unauthenticated", async () => {
    const app = buildUnauthApp();
    const res = await app.handle(new Request("http://localhost/admin/payouts"));
    expect(res.status).toBe(401);
  });

  it("GET /admin/payouts → 403 for vendor role", async () => {
    const app = buildVendorRoleApp();
    const res = await app.handle(new Request("http://localhost/admin/payouts"));
    expect(res.status).toBe(403);
  });

  // -------------------------------------------------------------------------
  // LIST
  // -------------------------------------------------------------------------

  it("GET /admin/payouts → 200 with envelope { data, total }", async () => {
    const { app } = buildAdminApp(payoutRows, auditRows);
    const res = await app.handle(new Request("http://localhost/admin/payouts"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.statusCode).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
    expect(typeof body.total).toBe("number");
    expect(body.data.length).toBe(2);
    expect(body.total).toBe(2);
  });

  it("GET /admin/payouts?status=processing → filters to processing only", async () => {
    const { app } = buildAdminApp(payoutRows, auditRows);
    const res = await app.handle(new Request("http://localhost/admin/payouts?status=processing"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.data.length).toBe(1);
    expect(body.data[0].status).toBe("processing");
  });

  it("GET /admin/payouts → returns empty data array when no payouts exist", async () => {
    const { app } = buildAdminApp([], auditRows);
    const res = await app.handle(new Request("http://localhost/admin/payouts"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.data).toEqual([]);
    expect(body.total).toBe(0);
  });

  // -------------------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------------------

  it("GET /admin/payouts/summary → 200 with counts", async () => {
    const { app } = buildAdminApp(payoutRows, auditRows);
    const res = await app.handle(new Request("http://localhost/admin/payouts/summary"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.statusCode).toBe(200);
    expect(typeof body.data.processing_count).toBe("number");
    expect(typeof body.data.failed_count).toBe("number");
    expect(body.data.processing_count).toBe(1);
    expect(body.data.failed_count).toBe(0);
  });

  // -------------------------------------------------------------------------
  // GET ONE
  // -------------------------------------------------------------------------

  it("GET /admin/payouts/:id → 200 when payout exists", async () => {
    const { app } = buildAdminApp(payoutRows, auditRows);
    const res = await app.handle(new Request("http://localhost/admin/payouts/pay-1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.data.id).toBe("pay-1");
    expect(body.data.payout_reference).toBe("PAY-2026-000001");
  });

  it("GET /admin/payouts/:id → 404 when payout does not exist", async () => {
    const { app } = buildAdminApp(payoutRows, auditRows);
    const res = await app.handle(new Request("http://localhost/admin/payouts/missing"));
    expect(res.status).toBe(404);
  });

  // -------------------------------------------------------------------------
  // TIMELINE
  // -------------------------------------------------------------------------

  it("GET /admin/payouts/:id/timeline → 200 with empty array when no audit rows", async () => {
    const { app } = buildAdminApp(payoutRows, []);
    const res = await app.handle(new Request("http://localhost/admin/payouts/pay-1/timeline"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(0);
  });

  it("GET /admin/payouts/:id/timeline → returns only rows matching that payout", async () => {
    const seedAudit = [
      makeAuditRow({ id: "a1", entity_id: "pay-1", action: "payout.status_changed" }),
      makeAuditRow({ id: "a2", entity_id: "pay-2", action: "payout.note_added" }),
    ];
    const { app } = buildAdminApp(payoutRows, seedAudit);
    const res = await app.handle(new Request("http://localhost/admin/payouts/pay-1/timeline"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.data.length).toBe(1);
    expect(body.data[0].entity_id).toBe("pay-1");
  });

  // -------------------------------------------------------------------------
  // GENERATE — no pending commissions → 400
  // -------------------------------------------------------------------------

  it("POST /admin/payouts/generate → 400 when vendor has no pending commissions", async () => {
    const { app } = buildAdminApp(payoutRows, auditRows);
    const res = await app.handle(
      new Request("http://localhost/admin/payouts/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          vendorId: "00000000-0000-0000-0000-000000000001",
          periodStart: "2026-04-01",
          periodEnd: "2026-04-30",
        }),
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.statusCode).toBe(400);
  });

  // -------------------------------------------------------------------------
  // STATUS TRANSITION: processing → paid
  // -------------------------------------------------------------------------

  it("PATCH /admin/payouts/:id/status → 200 transitions processing → paid and appends audit row", async () => {
    const { app, auditRepo } = buildAdminApp(payoutRows, auditRows);
    const res = await app.handle(
      new Request("http://localhost/admin/payouts/pay-1/status", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "paid", notes: "Wire confirmed" }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.data.status).toBe("paid");
    expect(body.data.notes).toBe("Wire confirmed");
    // Audit row written
    expect(auditRepo.save).toHaveBeenCalled();
    // verify via in-memory audit store
    const savedAudit = auditRows[0];
    expect(savedAudit).toBeDefined();
    expect(savedAudit!.action).toBe("payout.status_changed");
    expect((savedAudit!.changes as any)?.status?.new).toBe("paid");
  });

  it("PATCH /admin/payouts/:id/status → 400 when payout is not in processing state", async () => {
    const { app } = buildAdminApp(payoutRows, auditRows);
    const res = await app.handle(
      new Request("http://localhost/admin/payouts/pay-2/status", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "paid" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("PATCH /admin/payouts/:id/status → 400 when payout does not exist", async () => {
    const { app } = buildAdminApp(payoutRows, auditRows);
    const res = await app.handle(
      new Request("http://localhost/admin/payouts/missing/status", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "paid" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  // -------------------------------------------------------------------------
  // ADD NOTE
  // -------------------------------------------------------------------------

  it("POST /admin/payouts/:id/notes → 200 saves note and writes audit row", async () => {
    const { app, auditRepo } = buildAdminApp(payoutRows, auditRows);
    const res = await app.handle(
      new Request("http://localhost/admin/payouts/pay-1/notes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ note: "Investigate delay" }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.data.notes).toBe("Investigate delay");
    expect(auditRepo.save).toHaveBeenCalled();
    const auditEntry = auditRows.find((r) => r.action === "payout.note_added");
    expect(auditEntry).toBeDefined();
    expect((auditEntry!.metadata as any)?.note).toBe("Investigate delay");
  });

  it("POST /admin/payouts/:id/notes → 422 when note is empty string", async () => {
    const { app } = buildAdminApp(payoutRows, auditRows);
    const res = await app.handle(
      new Request("http://localhost/admin/payouts/pay-1/notes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ note: "" }),
      }),
    );
    // Elysia validates minLength: 1 → 422 Unprocessable Entity
    expect(res.status).toBe(422);
  });

  // -------------------------------------------------------------------------
  // APPROVE / REJECT — the only two ways money moves
  // -------------------------------------------------------------------------

  it("POST /admin/payouts/:id/approve → 202 for admin on a pending draft", async () => {
    payoutRows.push(makePayout({ id: "pay-3", status: "pending", vendor_id: "vendor-3" }));
    const { app, auditRepo } = buildAdminApp(payoutRows, auditRows);
    const res = await app.handle(
      new Request("http://localhost/admin/payouts/pay-3/approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rail: "stripe_connect" }),
      }),
    );
    expect(res.status).toBe(202);
    const body = (await res.json()) as any;
    expect(body.statusCode).toBe(202);
    expect(body.data.jobId).toBeDefined();
    expect(auditRepo.save).toHaveBeenCalled();
  });

  it("POST /admin/payouts/:id/approve → 422 when rail is missing", async () => {
    payoutRows.push(makePayout({ id: "pay-3b", status: "pending", vendor_id: "vendor-3" }));
    const { app } = buildAdminApp(payoutRows, auditRows);
    const res = await app.handle(
      new Request("http://localhost/admin/payouts/pay-3b/approve", { method: "POST" }),
    );
    // `rail` is required with no default (an explicit per-payment decision) —
    // the missing-body case must 422, not silently pick a rail.
    expect(res.status).toBe(422);
  });

  it("POST /admin/payouts/:id/approve → 403 for non-admin", async () => {
    const app = buildVendorRoleApp();
    const res = await app.handle(
      new Request("http://localhost/admin/payouts/pay-1/approve", { method: "POST" }),
    );
    expect(res.status).toBe(403);
  });

  it("POST /admin/payouts/:id/approve → 409 when the payout is not a pending draft", async () => {
    const { app } = buildAdminApp(payoutRows, auditRows); // pay-1 is "processing"
    const res = await app.handle(
      new Request("http://localhost/admin/payouts/pay-1/approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rail: "stripe_connect" }),
      }),
    );
    expect(res.status).toBe(409);
  });

  it("POST /admin/payouts/:id/approve → 404 when the payout does not exist", async () => {
    const { app } = buildAdminApp(payoutRows, auditRows);
    const res = await app.handle(
      new Request("http://localhost/admin/payouts/missing/approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rail: "stripe_connect" }),
      }),
    );
    expect(res.status).toBe(404);
  });

  it("POST /admin/payouts/:id/reject → 200 for admin on a pending draft", async () => {
    payoutRows.push(makePayout({ id: "pay-4", status: "pending", vendor_id: "vendor-4" }));
    const { app, auditRepo } = buildAdminApp(payoutRows, auditRows);
    const res = await app.handle(
      new Request("http://localhost/admin/payouts/pay-4/reject", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "wrong period" }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.data.ok).toBe(true);
    expect(auditRepo.save).toHaveBeenCalled();
    const auditEntry = auditRows.find((r) => r.action === "payout.draft_rejected");
    expect(auditEntry).toBeDefined();
    expect((auditEntry!.metadata as any)?.reason).toBe("wrong period");
  });

  // R4-C1 — the new void operation, wired exactly as the admin UI calls it.
  it("POST /admin/payouts/:id/void → 200 on a failed payout with no gateway_reference, and audits payout.voided", async () => {
    payoutRows.push(
      makePayout({
        id: "pay-void",
        status: "failed",
        gateway_reference: null,
        vendor_id: "vendor-9",
      }),
    );
    const { app } = buildAdminApp(payoutRows, auditRows);
    const res = await app.handle(
      new Request("http://localhost/admin/payouts/pay-void/void", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "Stripe account fixed; rebuild the draft" }),
      }),
    );
    expect(res.status).toBe(200);
    const entry = auditRows.find((r) => r.action === "payout.voided");
    expect(entry).toBeDefined();
    expect(entry!.entity_id).toBe("pay-void");
    expect((entry!.metadata as any)?.reason).toContain("Stripe account fixed");
  });

  it("POST /admin/payouts/:id/void → 409 PAYOUT_NOT_VOIDABLE when the transfer already went out", async () => {
    payoutRows.push(
      makePayout({ id: "pay-sent", status: "failed", gateway_reference: "tr_sent_once" }),
    );
    const { app } = buildAdminApp(payoutRows, auditRows);
    const res = await app.handle(
      new Request("http://localhost/admin/payouts/pay-sent/void", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "release it anyway" }),
      }),
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as any;
    expect(body.error).toBe("PAYOUT_NOT_VOIDABLE");
  });

  it("POST /admin/payouts/:id/void → 409 when the payout is not failed", async () => {
    const { app } = buildAdminApp(payoutRows, auditRows); // pay-1 is "processing"
    const res = await app.handle(
      new Request("http://localhost/admin/payouts/pay-1/void", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "x" }),
      }),
    );
    expect(res.status).toBe(409);
  });

  it("POST /admin/payouts/:id/void → 404 when the payout does not exist", async () => {
    const { app } = buildAdminApp(payoutRows, auditRows);
    const res = await app.handle(
      new Request("http://localhost/admin/payouts/missing/void", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "x" }),
      }),
    );
    expect(res.status).toBe(404);
  });

  it("POST /admin/payouts/:id/void → 4xx when the reason is missing or empty", async () => {
    payoutRows.push(makePayout({ id: "pay-void-2", status: "failed", gateway_reference: null }));
    const { app } = buildAdminApp(payoutRows, auditRows);
    const missing = await app.handle(
      new Request("http://localhost/admin/payouts/pay-void-2/void", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
    expect(missing.status).toBeGreaterThanOrEqual(400);
    expect(missing.status).toBeLessThan(500);
    const empty = await app.handle(
      new Request("http://localhost/admin/payouts/pay-void-2/void", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "" }),
      }),
    );
    expect(empty.status).toBeGreaterThanOrEqual(400);
    expect(empty.status).toBeLessThan(500);
  });

  it("POST /admin/payouts/:id/reject → 403 for non-admin", async () => {
    const app = buildVendorRoleApp();
    const res = await app.handle(
      new Request("http://localhost/admin/payouts/pay-1/reject", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "wrong period" }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("POST /admin/payouts/:id/reject → 409 when the payout is not a pending draft", async () => {
    const { app } = buildAdminApp(payoutRows, auditRows); // pay-2 is "paid"
    const res = await app.handle(
      new Request("http://localhost/admin/payouts/pay-2/reject", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "wrong period" }),
      }),
    );
    expect(res.status).toBe(409);
  });

  it("POST /admin/payouts/:id/reject → 422 when reason is empty string", async () => {
    const { app } = buildAdminApp(payoutRows, auditRows);
    const res = await app.handle(
      new Request("http://localhost/admin/payouts/pay-1/reject", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "" }),
      }),
    );
    expect(res.status).toBe(422);
  });

  // -------------------------------------------------------------------------
  // MANUAL RAIL LIFECYCLE — the unit tests cover each transition (approve's
  // rail dispatch, markPaid's reference requirement, retry's rail refusal) in
  // isolation. This proves they compose end to end through the real DTOs and
  // route wiring: a draft paid on the manual rail reaches `paid` with no
  // Stripe job ever queued, and a bounced transfer stays voidable.
  // -------------------------------------------------------------------------

  describe("manual rail lifecycle", () => {
    it("runs pending -> processing -> paid with no Stripe call", async () => {
      payoutRows.push(
        makePayout({
          id: "pay-manual-1",
          status: "pending",
          vendor_id: "vendor-manual-1",
          net_amount: 10_000,
          gateway_reference: null,
        }),
      );
      const { app } = buildAdminApp(payoutRows, auditRows);

      const approveRes = await app.handle(
        new Request("http://localhost/admin/payouts/pay-manual-1/approve", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ rail: "manual_bank_transfer" }),
        }),
      );
      expect(approveRes.status).toBe(202);
      const approveBody = (await approveRes.json()) as any;
      // No Stripe transfer job is ever queued on this rail.
      expect(approveBody.data.jobId).toBeNull();

      const afterApprove = payoutRows.find((r) => r.id === "pay-manual-1")!;
      expect(afterApprove.status).toBe("processing");
      expect(afterApprove.payout_rail).toBe("manual_bank_transfer");
      expect(afterApprove.gateway_reference).toBeNull();
      const approveAudit = auditRows.find((r) => r.entity_id === "pay-manual-1");
      expect(approveAudit?.action).toBe("payout.paid_manually_initiated");

      const statusRes = await app.handle(
        new Request("http://localhost/admin/payouts/pay-manual-1/status", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status: "paid", reference: "FT26073012345" }),
        }),
      );
      expect(statusRes.status).toBe(200);

      const final = payoutRows.find((r) => r.id === "pay-manual-1")!;
      expect(final.status).toBe("paid");
      expect(final.gateway_reference).toBe("FT26073012345");
    });

    it("400s when marking a manual payout paid with no reference", async () => {
      payoutRows.push(
        makePayout({
          id: "pay-manual-2",
          status: "processing",
          payout_rail: "manual_bank_transfer",
          vendor_id: "vendor-manual-2",
          gateway_reference: null,
        }),
      );
      const { app } = buildAdminApp(payoutRows, auditRows);

      const res = await app.handle(
        new Request("http://localhost/admin/payouts/pay-manual-2/status", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status: "paid" }),
        }),
      );
      expect(res.status).toBe(400);

      const row = payoutRows.find((r) => r.id === "pay-manual-2")!;
      expect(row.status).toBe("processing");
      expect(row.gateway_reference).toBeNull();
    });

    it("leaves a bounced manual transfer voidable", async () => {
      payoutRows.push(
        makePayout({
          id: "pay-manual-3",
          status: "pending",
          vendor_id: "vendor-manual-3",
          gateway_reference: null,
        }),
      );
      const { app } = buildAdminApp(payoutRows, auditRows);

      await app.handle(
        new Request("http://localhost/admin/payouts/pay-manual-3/approve", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ rail: "manual_bank_transfer" }),
        }),
      );

      const failRes = await app.handle(
        new Request("http://localhost/admin/payouts/pay-manual-3/status", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status: "failed", notes: "IBAN rejected by the bank" }),
        }),
      );
      expect(failRes.status).toBe(200);

      const failed = payoutRows.find((r) => r.id === "pay-manual-3")!;
      expect(failed.status).toBe("failed");
      // No reference was ever written, so nothing left — void must release
      // the claims back into the payable pool.
      expect(failed.gateway_reference).toBeNull();

      const voidRes = await app.handle(
        new Request("http://localhost/admin/payouts/pay-manual-3/void", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reason: "bounced" }),
        }),
      );
      expect(voidRes.status).toBe(200);
    });
  });
});
