import { describe, expect, test } from "bun:test";
import { toPayoutList } from "./payouts";

/**
 * GET /vendors/me/payouts answers with the payout array under `data`, not
 * under `data.items`:
 *
 *   commission.routes.ts   -> { statusCode, ...result, timestamp }
 *   commission.controller  -> result = { data: [...], total }
 *   payout.service         -> listForVendor(): Promise<{ data: VendorPayout[]; total: number }>
 *
 * so the response body is `{ statusCode, data: [...], total, timestamp }` and
 * axios's `response.data.data` is the array.
 *
 * The hook used to return that array straight through while the payouts page
 * reads `data.items` / `data.total` — so `items` was always `undefined`, the
 * list was always `[]`, and the page rendered the "No payouts yet" empty state
 * for every vendor no matter how many payouts they had. These pin the
 * translation, the same one `useVendorReturns` does for the same envelope.
 */

// A real response body, trimmed to the fields the page's columns read.
const RESPONSE_BODY = {
  statusCode: 200,
  data: [
    {
      id: "3f1c9a2e-0b7d-4e51-9f2a-6c8d1e40b7aa",
      reference: "PO-2026-0042",
      period_start: "2026-07-01T00:00:00.000Z",
      period_end: "2026-07-15T00:00:00.000Z",
      gross: 125_000,
      commission: 18_750,
      net: 106_250,
      status: "paid",
    },
  ],
  total: 1,
  timestamp: "2026-08-05T10:00:00.000Z",
};

describe("toPayoutList", () => {
  test("lifts the payout array out of the envelope's `data` key into `items`", () => {
    const result = toPayoutList(RESPONSE_BODY);

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual(RESPONSE_BODY.data[0]);
    expect(result.total).toBe(1);
  });

  test("the page's fields survive the translation", () => {
    // The payouts page renders one column per key; an envelope change that
    // dropped any of these would silently render "—" in that column.
    const [row] = toPayoutList(RESPONSE_BODY).items;

    expect(row.reference).toBe("PO-2026-0042");
    expect(row.gross).toBe(125_000);
    expect(row.commission).toBe(18_750);
    expect(row.net).toBe(106_250);
    expect(row.status).toBe("paid");
  });

  test("a vendor with no payouts yields an empty list, not undefined", () => {
    const result = toPayoutList({ statusCode: 200, data: [], total: 0 });

    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });

  test("a malformed/absent envelope degrades to empty instead of crashing the table", () => {
    // DataTable maps over `items`; undefined here would throw in render.
    expect(toPayoutList(undefined).items).toEqual([]);
    expect(toPayoutList({}).items).toEqual([]);
    expect(toPayoutList({}).total).toBe(0);
  });

  test("tolerates a backend that switches to an `items` envelope", () => {
    // /admin/payouts and the adjustments routes already answer with `items`.
    // If this route is ever aligned to them, the page must not break.
    const result = toPayoutList({ items: [{ id: "a" }], total: 1 });

    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
  });
});
