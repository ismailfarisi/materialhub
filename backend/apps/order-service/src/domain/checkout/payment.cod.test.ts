import { describe, expect, it } from "bun:test";
import { PaymentService } from "./payment.service.ts";

/** COD commit (E2E findings): ownership, idempotency, server-side amount, stock. */
function build(order: any, existingCod = false) {
  const sql: Array<{ q: string; p: any[] }> = [];
  const m = {
    query: (q: string, p: any[] = []) => {
      sql.push({ q, p });
      if (q.includes("FROM orders")) return Promise.resolve(order ? [order] : []);
      if (q.includes("FROM payments")) return Promise.resolve(existingCod ? [{ id: "pay-1" }] : []);
      return Promise.resolve([]);
    },
  };
  const paymentRepo: any = { manager: { transaction: (cb: any) => cb(m) } };
  return { service: new PaymentService(paymentRepo, {} as any), sql };
}
const pending = {
  id: "o1",
  user_id: "u1",
  status: "pending_payment",
  payment_status: "pending",
  grand_total: 10500,
};

describe("createCodPayment", () => {
  it("records the ORDER's total, confirms the order and commits its reservations", async () => {
    const { service, sql } = build({ ...pending });
    const res = await service.createCodPayment({ orderId: "o1", userId: "u1" });
    expect(res).toEqual({ status: "pending", idempotent: false });
    const insert = sql.find((s) => s.q.includes("INSERT INTO payments"));
    expect(insert?.p).toEqual(["o1", "u1", 10500]);
    expect(sql.some((s) => s.q.includes("SET status = 'confirmed'"))).toBe(true);
    expect(sql.some((s) => s.q.includes("inventory_reservations SET status = 'committed'"))).toBe(
      true,
    );
    expect(sql[0]?.q).toContain("FOR UPDATE");
  });

  it("another user's order is a 404 and writes nothing", async () => {
    const { service, sql } = build({ ...pending });
    await expect(service.createCodPayment({ orderId: "o1", userId: "intruder" })).rejects.toThrow(
      "Order not found",
    );
    expect(sql.some((s) => /^\s*(INSERT|UPDATE)/.test(s.q))).toBe(false);
  });

  it("a repeat call is idempotent and writes nothing", async () => {
    const { service, sql } = build({ ...pending, status: "confirmed" }, true);
    const res = await service.createCodPayment({ orderId: "o1", userId: "u1" });
    expect(res.idempotent).toBe(true);
    expect(sql.some((s) => /^\s*(INSERT|UPDATE)/.test(s.q))).toBe(false);
  });

  it("a cancelled order cannot be committed to COD", async () => {
    const { service } = build({ ...pending, status: "cancelled" });
    await expect(service.createCodPayment({ orderId: "o1", userId: "u1" })).rejects.toThrow(
      "can no longer be paid",
    );
  });
});
