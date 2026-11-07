import { describe, expect, it, mock } from "bun:test";
import { OrderApprovalService } from "./order-approval.service.ts";

/**
 * reserveForCheckout gates buyer-role members above their company's approval
 * limit. A raw UPDATE ... RETURNING resolves to [rows, rowCount] (verified
 * against Postgres), which the gate used to misread as "found".
 */
function build(updateResult: unknown) {
  const query = mock(() => Promise.resolve(updateResult));
  const repo: any = { manager: { query } };
  return new OrderApprovalService(repo, {} as any);
}
const buyerCtx: any = { role: "buyer", approvalThresholdFils: 50000 };
const lines: any[] = [{ product_id: "p1", variant_id: null, quantity: 10, unit_price: 5750 }];

describe("reserveForCheckout", () => {
  it("blocks an order above the limit when no approval exists (403)", async () => {
    const svc = build([[], 0]);
    await expect(svc.reserveForCheckout(buyerCtx, "u1", lines, 57500)).rejects.toThrow(
      "need approval",
    );
  });

  it("returns the reserved approval id when one exists", async () => {
    const svc = build([[{ id: "appr-1" }], 1]);
    expect(await svc.reserveForCheckout(buyerCtx, "u1", lines, 57500)).toBe("appr-1");
  });

  it("needs nothing under the limit", async () => {
    const svc = build([[], 0]);
    expect(await svc.reserveForCheckout(buyerCtx, "u1", lines, 40000)).toBeNull();
  });
});
