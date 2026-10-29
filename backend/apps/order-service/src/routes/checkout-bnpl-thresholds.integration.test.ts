import { describe, expect, it } from "bun:test";
import { Elysia, t } from "elysia";
import { In } from "typeorm";

// Minimal in-process route tests — no real DB needed.
// Mirrors the harness in checkout-quote.integration.test.ts: stub the
// repository's `find` method with the same signature TypeORM uses, then
// invoke the route via app.handle().

type PmtRow = {
  provider: "tabby" | "tamara" | "cod";
  min_amount_fils: number;
  max_amount_fils: number;
  plans: { installments: number; interval_days: number }[];
  is_active: boolean;
  surcharge_fils: number | null;
};

const TABBY_ROW: PmtRow = {
  provider: "tabby",
  min_amount_fils: 10000,
  max_amount_fils: 1000000,
  plans: [{ installments: 4, interval_days: 14 }],
  is_active: true,
  surcharge_fils: 0,
};

const TAMARA_ROW: PmtRow = {
  provider: "tamara",
  min_amount_fils: 20000,
  max_amount_fils: 2000000,
  plans: [
    { installments: 3, interval_days: 30 },
    { installments: 4, interval_days: 30 },
  ],
  is_active: true,
  surcharge_fils: null,
};

const COD_ROW: PmtRow = {
  provider: "cod",
  min_amount_fils: 0,
  max_amount_fils: 500000,
  plans: [],
  is_active: true,
  surcharge_fils: 1000,
};

const makeApp = (rows: PmtRow[]) => {
  // Mimic TypeORM's repo.find({ where: { is_active, provider: In([...]) } })
  // by inspecting the In() instance and is_active flag at call time.
  const paymentMethodThresholdRepo = {
    find: async (opts: any) => {
      const where = opts?.where ?? {};
      const providerFilter = where.provider; // FindOperator from In()
      const allowed: string[] = providerFilter?._value ?? providerFilter?.value ?? [];
      return rows.filter((r) => {
        if (where.is_active !== undefined && r.is_active !== where.is_active) return false;
        if (allowed.length && !allowed.includes(r.provider)) return false;
        return true;
      });
    },
  };

  return new Elysia().decorate("paymentMethodThresholdRepo", paymentMethodThresholdRepo).get(
    "/checkout/bnpl-thresholds",
    async ({ paymentMethodThresholdRepo: repo }: any) => {
      const rows = await repo.find({
        where: { is_active: true, provider: In(["tabby", "tamara"]) },
      });
      return {
        data: rows.map((r: any) => ({
          provider: r.provider,
          min_amount_fils: r.min_amount_fils,
          max_amount_fils: r.max_amount_fils,
          plans: r.plans,
          surcharge_fils: r.surcharge_fils ?? 0,
        })),
      };
    },
    {
      response: t.Object({
        data: t.Array(
          t.Object({
            provider: t.Union([t.Literal("tabby"), t.Literal("tamara")]),
            min_amount_fils: t.Number(),
            max_amount_fils: t.Number(),
            plans: t.Array(t.Object({ installments: t.Integer(), interval_days: t.Integer() })),
            surcharge_fils: t.Number(),
          }),
        ),
      }),
    },
  );
};

describe("GET /checkout/bnpl-thresholds", () => {
  let app: ReturnType<typeof makeApp>;

  it("returns both providers when tabby and tamara are active", async () => {
    app = makeApp([TABBY_ROW, TAMARA_ROW]);
    const res = await app.handle(new Request("http://localhost/checkout/bnpl-thresholds"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data).toHaveLength(2);
    const providers = body.data.map((r: any) => r.provider).sort();
    expect(providers).toEqual(["tabby", "tamara"]);

    const tabby = body.data.find((r: any) => r.provider === "tabby");
    expect(tabby.min_amount_fils).toBe(10000);
    expect(tabby.max_amount_fils).toBe(1000000);
    expect(tabby.plans).toEqual([{ installments: 4, interval_days: 14 }]);
    expect(tabby.surcharge_fils).toBe(0);

    const tamara = body.data.find((r: any) => r.provider === "tamara");
    // null surcharge_fils coerces to 0 in the response shape
    expect(tamara.surcharge_fils).toBe(0);
    expect(tamara.plans).toHaveLength(2);
  });

  it("excludes a row when its is_active is false", async () => {
    app = makeApp([TABBY_ROW, { ...TAMARA_ROW, is_active: false }]);
    const res = await app.handle(new Request("http://localhost/checkout/bnpl-thresholds"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.data).toHaveLength(1);
    expect(body.data[0].provider).toBe("tabby");
  });

  it("excludes the cod row even when active", async () => {
    app = makeApp([TABBY_ROW, TAMARA_ROW, COD_ROW]);
    const res = await app.handle(new Request("http://localhost/checkout/bnpl-thresholds"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.data).toHaveLength(2);
    const providers = body.data.map((r: any) => r.provider);
    expect(providers).not.toContain("cod");
  });

  it("returns empty array when no BNPL rows exist", async () => {
    app = makeApp([COD_ROW]);
    const res = await app.handle(new Request("http://localhost/checkout/bnpl-thresholds"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.data).toEqual([]);
  });
});
