import { describe, expect, test } from "bun:test";
import {
  AdminAdjustmentListQuery,
  AdminPayoutCommissionsQuery,
  AdminPayoutListQuery,
} from "@materialhub/dto";
import { Elysia } from "elysia";

/**
 * Every value in a query string is a string: the admin payouts page sends
 * `?page=1&limit=20` on every load, and the route receives `"1"` / `"20"`.
 *
 * These three schemas used `Type.Integer`, which Elysia does NOT coerce (it
 * coerces `Type.Number`, which is what every other paginated DTO in the repo
 * uses). So the list endpoint answered 400 `{"type":"validation","on":"query",
 * "found":{"page":"1","limit":"20"}}` for every single request, and the admin
 * payouts list never rendered.
 *
 * The existing DTO tests missed it because they assert with `Value.Check`,
 * which is handed a real JS number and so passes on a schema the live route
 * rejects. These go through a real Elysia route for that reason — the defect
 * lived in the coercion at the route boundary, not in the schema in isolation.
 */
async function get(schema: unknown, queryString: string) {
  const app = new Elysia().get("/probe", ({ query }) => ({ query }), { query: schema as never });
  const res = await app.handle(new Request(`http://localhost/probe${queryString}`));
  return { status: res.status, body: (await res.json().catch(() => null)) as any };
}

const paginated: Array<[string, unknown]> = [
  ["AdminPayoutListQuery", AdminPayoutListQuery],
  ["AdminPayoutCommissionsQuery", AdminPayoutCommissionsQuery],
];

describe("admin payout query schemas coerce string query params", () => {
  for (const [name, schema] of paginated) {
    test(`${name} accepts ?page=1&limit=20 and yields numbers`, async () => {
      const { status, body } = await get(schema, "?page=1&limit=20");
      expect(status).toBe(200);
      expect(body.query.page).toBe(1);
      expect(body.query.limit).toBe(20);
    });

    test(`${name} applies its defaults when the params are absent`, async () => {
      const { status, body } = await get(schema, "");
      expect(status).toBe(200);
      expect(body.query.page).toBe(1);
      expect(body.query.limit).toBe(20);
    });

    test(`${name} still enforces the bounds`, async () => {
      expect((await get(schema, "?page=0")).status).not.toBe(200);
      expect((await get(schema, "?limit=500")).status).not.toBe(200);
    });

    test(`${name} still rejects a fractional page`, async () => {
      // Coercing with a plain Type.Number would let this through and produce a
      // fractional SQL OFFSET downstream; multipleOf:1 keeps it out.
      expect((await get(schema, "?page=1.5")).status).not.toBe(200);
    });

    test(`${name} still rejects a non-numeric value`, async () => {
      expect((await get(schema, "?page=abc")).status).not.toBe(200);
    });
  }

  test("AdminPayoutListQuery coerces the net-range filters too", async () => {
    const { status, body } = await get(AdminPayoutListQuery, "?minNet=0&maxNet=500000");
    expect(status).toBe(200);
    expect(body.query.minNet).toBe(0);
    expect(body.query.maxNet).toBe(500000);
  });

  test("AdminPayoutListQuery still accepts the page's real filter combination", async () => {
    const { status, body } = await get(
      AdminPayoutListQuery,
      "?status=pending&limit=1&page=1&vendorId=11111111-1111-4111-8111-111111111111",
    );
    expect(status).toBe(200);
    expect(body.query.status).toBe("pending");
    expect(body.query.limit).toBe(1);
  });

  test("AdminAdjustmentListQuery coerces alongside its required vendorId", async () => {
    const { status, body } = await get(
      AdminAdjustmentListQuery,
      "?vendorId=11111111-1111-4111-8111-111111111111&page=2&limit=50",
    );
    expect(status).toBe(200);
    expect(body.query.page).toBe(2);
    expect(body.query.limit).toBe(50);
  });

  test("AdminAdjustmentListQuery still requires vendorId", async () => {
    expect((await get(AdminAdjustmentListQuery, "?page=1&limit=20")).status).not.toBe(200);
  });
});
