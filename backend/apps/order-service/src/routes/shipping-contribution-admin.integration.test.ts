import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Elysia, t } from "elysia";

type FakeRow = {
  id: string;
  vendor_id: string | null;
  min_order_value: number;
  vendor_contribution: number;
  currency: string;
  is_active: boolean;
  sort_order: number;
  deleted_at: Date | null;
};

function makeRow(o: Partial<FakeRow> = {}): FakeRow {
  return {
    id: o.id ?? "tier-1",
    vendor_id: o.vendor_id ?? null,
    min_order_value: o.min_order_value ?? 0,
    vendor_contribution: o.vendor_contribution ?? 300,
    currency: o.currency ?? "AED",
    is_active: o.is_active ?? true,
    sort_order: o.sort_order ?? 0,
    deleted_at: o.deleted_at ?? null,
  };
}

function makeRepo(rows: FakeRow[]) {
  return {
    findOne: mock(async (opts: any) => rows.find((r) => r.id === opts?.where?.id) ?? null),
    save: mock(async (partial: any) => {
      const row = makeRow({ ...partial, id: partial.id ?? `tier-${rows.length + 1}` });
      rows.push(row);
      return row;
    }),
    update: mock(async (where: any, patch: any) => {
      const r = rows.find((x) => x.id === where.id);
      if (r) Object.assign(r, patch);
      return { affected: r ? 1 : 0 };
    }),
    softDelete: mock(async (id: string) => {
      const r = rows.find((x) => x.id === id);
      if (r) r.deleted_at = new Date();
      return { affected: r ? 1 : 0 };
    }),
    createQueryBuilder: mock(() => ({
      where() {
        return this;
      },
      andWhere() {
        return this;
      },
      orderBy() {
        return this;
      },
      addOrderBy() {
        return this;
      },
      getMany: async () => rows.filter((r) => !r.deleted_at),
    })),
  };
}

function makeSettingRepo(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    findOne: mock(async (opts: any) => {
      const k = opts?.where?.key;
      return store.has(k) ? { key: k, value: store.get(k), value_type: "integer" } : null;
    }),
    save: mock(async (row: any) => {
      store.set(row.key, String(row.value));
      return row;
    }),
    _store: store,
  };
}

const ok = (data: unknown, status = 200) => ({ statusCode: status, data, timestamp: "t" });
const err = (status: number, error: string, message: string) => ({
  statusCode: status,
  error,
  message,
  timestamp: "t",
});

const BaseTierBody = {
  min_order_value: t.Integer({ minimum: 0 }),
  vendor_contribution: t.Integer({ minimum: 0 }),
  vendor_id: t.Optional(t.Union([t.String({ format: "uuid" }), t.Null()])),
  currency: t.Optional(t.String({ minLength: 3, maxLength: 3 })),
  is_active: t.Optional(t.Boolean()),
  sort_order: t.Optional(t.Integer({ minimum: 0 })),
};

const buildApp = (rows: FakeRow[] = [], settings: Record<string, string> = {}) => {
  const repo = makeRepo(rows);
  const settingRepo = makeSettingRepo(settings);
  const app = new Elysia()
    .decorate("shippingContributionTierRepo", repo as any)
    .decorate("siteSettingRepo", settingRepo as any)
    .derive(() => ({ user: { id: "admin-1", role: "admin" } }))
    .get("/admin/shipping-contribution-tiers/base-cost", async ({ siteSettingRepo }: any) => {
      const row = await siteSettingRepo.findOne({
        where: { key: "shipping.base_carrier_cost_fils" },
      });
      const value = row ? Number(row.value) : 1300;
      return ok({ base_carrier_cost_fils: value });
    })
    .patch(
      "/admin/shipping-contribution-tiers/base-cost",
      async ({ body, siteSettingRepo }: any) => {
        const existing = await siteSettingRepo.findOne({
          where: { key: "shipping.base_carrier_cost_fils" },
        });
        await siteSettingRepo.save({
          ...(existing ?? {}),
          key: "shipping.base_carrier_cost_fils",
          value: String(body.base_carrier_cost_fils),
          value_type: "integer",
          setting_group: "shipping",
        });
        return ok({ base_carrier_cost_fils: body.base_carrier_cost_fils });
      },
      { body: t.Object({ base_carrier_cost_fils: t.Integer({ minimum: 0 }) }) },
    )
    .get(
      "/admin/shipping-contribution-tiers",
      async ({ query, shippingContributionTierRepo }: any) => {
        const qb = shippingContributionTierRepo
          .createQueryBuilder("t")
          .orderBy("t.vendor_id", "ASC")
          .addOrderBy("t.min_order_value", "ASC");
        if (!query.include_deleted || query.include_deleted === "false")
          qb.where("t.deleted_at IS NULL");
        if (query.vendor_id === "platform") qb.andWhere("t.vendor_id IS NULL");
        else if (query.vendor_id) qb.andWhere("t.vendor_id = :v", { v: query.vendor_id });
        if (query.is_active === "true") qb.andWhere("t.is_active = true");
        if (query.is_active === "false") qb.andWhere("t.is_active = false");
        return ok(await qb.getMany());
      },
      {
        query: t.Object({
          vendor_id: t.Optional(t.String()),
          is_active: t.Optional(t.String()),
          include_deleted: t.Optional(t.String()),
        }),
      },
    )
    .get(
      "/admin/shipping-contribution-tiers/:id",
      async ({ params, shippingContributionTierRepo, set }: any) => {
        const row = await shippingContributionTierRepo.findOne({ where: { id: params.id } });
        if (!row || row.deleted_at) {
          set.status = 404;
          return err(404, "NOT_FOUND", `tier '${params.id}' not found`);
        }
        return ok(row);
      },
      { params: t.Object({ id: t.String() }) },
    )
    .post(
      "/admin/shipping-contribution-tiers",
      async ({ body, shippingContributionTierRepo, set }: any) => {
        const saved = await shippingContributionTierRepo.save(body);
        set.status = 201;
        return { statusCode: 201, data: saved, timestamp: "t" };
      },
      { body: t.Object(BaseTierBody) },
    )
    .patch(
      "/admin/shipping-contribution-tiers/:id",
      async ({ params, body, shippingContributionTierRepo, set }: any) => {
        const row = await shippingContributionTierRepo.findOne({ where: { id: params.id } });
        if (!row) {
          set.status = 404;
          return err(404, "NOT_FOUND", `tier '${params.id}' not found`);
        }
        await shippingContributionTierRepo.update({ id: params.id }, body);
        return ok(await shippingContributionTierRepo.findOne({ where: { id: params.id } }));
      },
      {
        params: t.Object({ id: t.String() }),
        body: t.Object(
          Object.fromEntries(
            Object.entries(BaseTierBody).map(([k, v]) => [k, t.Optional(v as any)]),
          ) as any,
        ),
      },
    )
    .delete(
      "/admin/shipping-contribution-tiers/:id",
      async ({ params, shippingContributionTierRepo, set }: any) => {
        const row = await shippingContributionTierRepo.findOne({ where: { id: params.id } });
        if (!row) {
          set.status = 404;
          return err(404, "NOT_FOUND", `tier '${params.id}' not found`);
        }
        await shippingContributionTierRepo.softDelete(params.id);
        return ok({ id: params.id });
      },
      { params: t.Object({ id: t.String() }) },
    );
  return { app, repo, settingRepo };
};

describe("shipping-contribution-admin.routes", () => {
  let rows: FakeRow[];
  beforeEach(() => {
    rows = [
      makeRow({ id: "t1", min_order_value: 0, vendor_contribution: 300, sort_order: 0 }),
      makeRow({ id: "t2", min_order_value: 5100, vendor_contribution: 800, sort_order: 2 }),
    ];
  });

  it("GET lists active tiers", async () => {
    const { app } = buildApp(rows);
    const res = await app.handle(new Request("http://localhost/admin/shipping-contribution-tiers"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.data.length).toBe(2);
  });

  it("GET /:id 404 when missing", async () => {
    const { app } = buildApp(rows);
    const res = await app.handle(
      new Request("http://localhost/admin/shipping-contribution-tiers/missing"),
    );
    expect(res.status).toBe(404);
  });

  it("POST creates a tier", async () => {
    const { app, repo } = buildApp([]);
    const res = await app.handle(
      new Request("http://localhost/admin/shipping-contribution-tiers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ min_order_value: 2100, vendor_contribution: 500 }),
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.data.vendor_contribution).toBe(500);
    expect(repo.save).toHaveBeenCalled();
  });

  it("POST 422 when vendor_contribution missing", async () => {
    const { app } = buildApp([]);
    const res = await app.handle(
      new Request("http://localhost/admin/shipping-contribution-tiers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ min_order_value: 0 }),
      }),
    );
    expect(res.status).toBe(422);
  });

  it("PATCH updates a tier", async () => {
    const { app, repo } = buildApp(rows);
    const res = await app.handle(
      new Request("http://localhost/admin/shipping-contribution-tiers/t1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ vendor_contribution: 350 }),
      }),
    );
    expect(res.status).toBe(200);
    expect(repo.update).toHaveBeenCalled();
  });

  it("DELETE soft-deletes a tier", async () => {
    const { app, repo } = buildApp(rows);
    const res = await app.handle(
      new Request("http://localhost/admin/shipping-contribution-tiers/t1", { method: "DELETE" }),
    );
    expect(res.status).toBe(200);
    expect(repo.softDelete).toHaveBeenCalledWith("t1");
  });

  it("GET base-cost returns the default when unset", async () => {
    const { app } = buildApp(rows);
    const res = await app.handle(
      new Request("http://localhost/admin/shipping-contribution-tiers/base-cost"),
    );
    const body = (await res.json()) as any;
    expect(body.data.base_carrier_cost_fils).toBe(1300);
  });

  it("PATCH base-cost upserts the setting", async () => {
    const { app, settingRepo } = buildApp(rows);
    const res = await app.handle(
      new Request("http://localhost/admin/shipping-contribution-tiers/base-cost", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ base_carrier_cost_fils: 1500 }),
      }),
    );
    expect(res.status).toBe(200);
    expect(settingRepo._store.get("shipping.base_carrier_cost_fils")).toBe("1500");
  });
});
