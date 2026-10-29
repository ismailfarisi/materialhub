import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import { VendorPayoutListQuery } from "./vendor-payout.query.ts";

/**
 * GET /vendors/me/payouts — the vendor dashboard's payouts page.
 *
 * Elysia silently DROPS query params a schema doesn't declare: no 400, no
 * warning, just a 200 whose handler never sees the value. The page's Status
 * dropdown sent `?status=paid` into a schema that only declared page/limit,
 * so the selection evaporated at the route boundary and the list came back
 * unfiltered — the control looked wired and did nothing.
 *
 * These go through a real Elysia route (not Value.Check) for the same reason
 * admin-payout-query-coercion.test.ts does: the defect lived in what the
 * boundary does to the query object, not in the schema read in isolation.
 */
async function get(queryString: string) {
  const app = new Elysia().get("/probe", ({ query }) => ({ query }), {
    query: VendorPayoutListQuery as never,
  });
  const res = await app.handle(new Request(`http://localhost/probe${queryString}`));
  return { status: res.status, body: (await res.json().catch(() => null)) as any };
}

describe("VendorPayoutListQuery", () => {
  test("passes `status` through to the handler instead of stripping it", async () => {
    const { status, body } = await get("?status=paid&page=1&limit=20");

    expect(status).toBe(200);
    expect(body.query.status).toBe("paid");
  });

  for (const value of ["pending", "processing", "paid", "failed"]) {
    test(`accepts the '${value}' option the page offers`, async () => {
      const { status, body } = await get(`?status=${value}`);

      expect(status).toBe(200);
      expect(body.query.status).toBe(value);
    });
  }

  test("omitting `status` is valid and means 'all statuses'", async () => {
    const { status, body } = await get("?page=1&limit=20");

    expect(status).toBe(200);
    expect(body.query.status).toBeUndefined();
  });

  test("rejects a status outside the PayoutStatus enum", async () => {
    // Guards against a typo'd option silently behaving like "all statuses".
    const { status } = await get("?status=settled");

    expect(status).toBe(422);
  });

  test("still coerces page/limit from their string query values", async () => {
    const { status, body } = await get("?page=2&limit=50");

    expect(status).toBe(200);
    expect(body.query.page).toBe(2);
    expect(body.query.limit).toBe(50);
  });

  test("applies the page/limit defaults when absent", async () => {
    const { status, body } = await get("");

    expect(status).toBe(200);
    expect(body.query.page).toBe(1);
    expect(body.query.limit).toBe(20);
  });
});
