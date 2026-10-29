import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Elysia, t } from "elysia";

// In-process tests — no real DB, Redis, or auth guards needed.
// We inline the handler logic (mirroring checkout-quote.integration.test.ts)
// so that jwtAuth / requireRole do not reject the synthetic user context.
// The guards themselves are covered by the guards lib tests.

type FakeRow = {
  id: string;
  vendor_id: string | null;
  zone_id: string | null;
  name: string;
  method: string;
  base_cost: number;
  is_active: boolean;
  sort_order: number;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

function makeRow(overrides: Partial<FakeRow> = {}): FakeRow {
  const now = new Date();
  return {
    id: overrides.id ?? "rate-1",
    vendor_id: null,
    zone_id: null,
    name: "Standard",
    method: "standard",
    base_cost: 1500,
    is_active: true,
    sort_order: 0,
    deleted_at: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function makeRepo(rows: FakeRow[]) {
  return {
    find: mock(async (_opts: any) => rows.filter((r) => !r.deleted_at)),
    findOne: mock(async (opts: any) => {
      const id = opts?.where?.id;
      return rows.find((r) => r.id === id) ?? null;
    }),
    save: mock(async (partial: any) => {
      const row = makeRow({ ...partial, id: partial.id ?? `rate-${rows.length + 1}` });
      rows.push(row);
      return row;
    }),
    update: mock(async (where: any, patch: any) => {
      const r = rows.find((x) => x.id === where.id);
      if (r) Object.assign(r, patch, { updated_at: new Date() });
      return { affected: r ? 1 : 0 };
    }),
    softDelete: mock(async (id: string) => {
      const r = rows.find((x) => x.id === id);
      if (r) r.deleted_at = new Date();
      return { affected: r ? 1 : 0 };
    }),
    createQueryBuilder: mock(() => ({
      where: function () {
        return this;
      },
      andWhere: function () {
        return this;
      },
      orderBy: function () {
        return this;
      },
      addOrderBy: function () {
        return this;
      },
      getMany: async () => rows.filter((r) => !r.deleted_at),
    })),
  };
}

const ok = (data: unknown, status = 200) => ({
  statusCode: status,
  data,
  timestamp: new Date().toISOString(),
});
const err = (status: number, error: string, message: string) => ({
  statusCode: status,
  error,
  message,
  timestamp: new Date().toISOString(),
});

const BaseRateBody = {
  name: t.String({ minLength: 1, maxLength: 255 }),
  method: t.String({ minLength: 1, maxLength: 100 }),
  base_cost: t.Integer({ minimum: 0 }),
  vendor_id: t.Optional(t.Union([t.String({ format: "uuid" }), t.Null()])),
  zone_id: t.Optional(t.Union([t.String({ format: "uuid" }), t.Null()])),
  min_weight_grams: t.Optional(t.Union([t.Integer({ minimum: 0 }), t.Null()])),
  max_weight_grams: t.Optional(t.Union([t.Integer({ minimum: 0 }), t.Null()])),
  min_order_amount: t.Optional(t.Union([t.Integer({ minimum: 0 }), t.Null()])),
  carrier: t.Optional(t.Union([t.String({ maxLength: 100 }), t.Null()])),
  carrier_cost: t.Optional(t.Union([t.Integer({ minimum: 0 }), t.Null()])),
  per_kg_cost: t.Optional(t.Integer({ minimum: 0 })),
  free_above: t.Optional(t.Union([t.Integer({ minimum: 0 }), t.Null()])),
  currency: t.Optional(t.String({ minLength: 3, maxLength: 3 })),
  estimated_days_min: t.Optional(t.Union([t.Integer({ minimum: 0 }), t.Null()])),
  estimated_days_max: t.Optional(t.Union([t.Integer({ minimum: 0 }), t.Null()])),
  is_active: t.Optional(t.Boolean()),
  sort_order: t.Optional(t.Integer({ minimum: 0 })),
};

const buildApp = (rows: FakeRow[] = []) => {
  const repo = makeRepo(rows);

  const app = new Elysia()
    .decorate("shippingRateRepo", repo as any)
    .derive(() => ({ user: { id: "admin-1", role: "admin" } }))
    // LIST
    .get(
      "/admin/shipping-rates",
      async ({ query, shippingRateRepo }: any) => {
        const qb = shippingRateRepo
          .createQueryBuilder("r")
          .orderBy("r.sort_order", "ASC")
          .addOrderBy("r.created_at", "DESC");

        if (!query.include_deleted || query.include_deleted === "false") {
          qb.where("r.deleted_at IS NULL");
        }

        if (query.vendor_id === "platform") {
          qb.andWhere("r.vendor_id IS NULL");
        } else if (query.vendor_id) {
          qb.andWhere("r.vendor_id = :v", { v: query.vendor_id });
        }

        if (query.zone_id === "any") {
          qb.andWhere("r.zone_id IS NULL");
        } else if (query.zone_id) {
          qb.andWhere("r.zone_id = :z", { z: query.zone_id });
        }

        if (query.method) qb.andWhere("r.method = :m", { m: query.method });
        if (query.is_active === "true") qb.andWhere("r.is_active = true");
        if (query.is_active === "false") qb.andWhere("r.is_active = false");

        const rows = await qb.getMany();
        return ok(rows);
      },
      {
        query: t.Object({
          vendor_id: t.Optional(t.String()),
          zone_id: t.Optional(t.String()),
          method: t.Optional(t.String()),
          is_active: t.Optional(t.String()),
          include_deleted: t.Optional(t.String()),
        }),
      },
    )
    // GET ONE
    .get(
      "/admin/shipping-rates/:id",
      async ({ params, shippingRateRepo, set }: any) => {
        const row = await shippingRateRepo.findOne({ where: { id: params.id } });
        if (!row || row.deleted_at) {
          set.status = 404;
          return err(404, "NOT_FOUND", `Shipping rate '${params.id}' not found`);
        }
        return ok(row);
      },
      { params: t.Object({ id: t.String() }) },
    )
    // CREATE
    .post(
      "/admin/shipping-rates",
      async ({ body, shippingRateRepo, set }: any) => {
        const saved = await shippingRateRepo.save(body);
        set.status = 201;
        return { statusCode: 201, data: saved, timestamp: new Date().toISOString() };
      },
      { body: t.Object(BaseRateBody) },
    )
    // UPDATE
    .patch(
      "/admin/shipping-rates/:id",
      async ({ params, body, shippingRateRepo, set }: any) => {
        const row = await shippingRateRepo.findOne({ where: { id: params.id } });
        if (!row) {
          set.status = 404;
          return err(404, "NOT_FOUND", `Shipping rate '${params.id}' not found`);
        }
        await shippingRateRepo.update({ id: params.id }, body);
        const updated = await shippingRateRepo.findOne({ where: { id: params.id } });
        return ok(updated);
      },
      {
        params: t.Object({ id: t.String() }),
        body: t.Object(
          Object.fromEntries(
            Object.entries(BaseRateBody).map(([k, v]) => [k, t.Optional(v as any)]),
          ) as unknown as typeof BaseRateBody,
        ),
      },
    )
    // SOFT DELETE
    .delete(
      "/admin/shipping-rates/:id",
      async ({ params, shippingRateRepo, set }: any) => {
        const row = await shippingRateRepo.findOne({ where: { id: params.id } });
        if (!row) {
          set.status = 404;
          return err(404, "NOT_FOUND", `Shipping rate '${params.id}' not found`);
        }
        await shippingRateRepo.softDelete(params.id);
        return ok({ id: params.id, deleted_at: new Date().toISOString() });
      },
      { params: t.Object({ id: t.String() }) },
    );

  return { app, repo };
};

describe("shipping-rate-admin.routes", () => {
  let rows: FakeRow[];

  beforeEach(() => {
    rows = [
      makeRow({ id: "r1", method: "standard", sort_order: 10 }),
      makeRow({ id: "r2", method: "express", base_cost: 3000, sort_order: 20 }),
    ];
  });

  it("GET /admin/shipping-rates lists active rows", async () => {
    const { app } = buildApp(rows);
    const res = await app.handle(new Request("http://localhost/admin/shipping-rates"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.statusCode).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(2);
  });

  it("GET /admin/shipping-rates/:id returns 404 when not found", async () => {
    const { app } = buildApp(rows);
    const res = await app.handle(new Request("http://localhost/admin/shipping-rates/missing"));
    expect(res.status).toBe(404);
  });

  it("GET /admin/shipping-rates/:id returns the row when found", async () => {
    const { app } = buildApp(rows);
    const res = await app.handle(new Request("http://localhost/admin/shipping-rates/r1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.data.id).toBe("r1");
  });

  it("POST /admin/shipping-rates creates a platform-default rate", async () => {
    const { app, repo } = buildApp([]);
    const res = await app.handle(
      new Request("http://localhost/admin/shipping-rates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Standard",
          method: "standard",
          base_cost: 1500,
        }),
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.data.method).toBe("standard");
    expect(body.data.base_cost).toBe(1500);
    expect(repo.save).toHaveBeenCalled();
  });

  it("POST /admin/shipping-rates 422 when name missing", async () => {
    const { app } = buildApp([]);
    const res = await app.handle(
      new Request("http://localhost/admin/shipping-rates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ method: "standard", base_cost: 1500 }),
      }),
    );
    expect(res.status).toBe(422);
  });

  it("PATCH /admin/shipping-rates/:id updates mutable fields", async () => {
    const { app, repo } = buildApp(rows);
    const res = await app.handle(
      new Request("http://localhost/admin/shipping-rates/r1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ is_active: false, base_cost: 2000 }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.data.id).toBe("r1");
    expect(repo.update).toHaveBeenCalled();
  });

  it("PATCH /admin/shipping-rates/:id 404 when row is missing", async () => {
    const { app } = buildApp([]);
    const res = await app.handle(
      new Request("http://localhost/admin/shipping-rates/missing", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ is_active: false }),
      }),
    );
    expect(res.status).toBe(404);
  });

  it("DELETE /admin/shipping-rates/:id soft-deletes", async () => {
    const { app, repo } = buildApp(rows);
    const res = await app.handle(
      new Request("http://localhost/admin/shipping-rates/r1", { method: "DELETE" }),
    );
    expect(res.status).toBe(200);
    expect(repo.softDelete).toHaveBeenCalledWith("r1");
  });

  it("DELETE /admin/shipping-rates/:id 404 when row is missing", async () => {
    const { app } = buildApp([]);
    const res = await app.handle(
      new Request("http://localhost/admin/shipping-rates/missing", { method: "DELETE" }),
    );
    expect(res.status).toBe(404);
  });
});
