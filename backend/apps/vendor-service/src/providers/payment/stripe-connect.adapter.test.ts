import { describe, expect, test } from "bun:test";
import Stripe from "stripe";
import { StripeConnectAdapter } from "./stripe-connect.adapter.ts";

const SECRET = "whsec_test_connect";
const signer = new Stripe("sk_test_dummy");

async function signed(event: object) {
  const payload = JSON.stringify(event);
  const header = await signer.webhooks.generateTestHeaderStringAsync({ payload, secret: SECRET });
  return { payload, header };
}

describe("StripeConnectAdapter.handleWebhook", () => {
  const adapter = new StripeConnectAdapter("sk_test_dummy", SECRET);

  test("accepts a correctly signed account.updated event (works under Bun)", async () => {
    const { payload, header } = await signed({
      id: "evt_1",
      type: "account.updated",
      data: {
        object: {
          id: "acct_123",
          charges_enabled: true,
          payouts_enabled: false,
          details_submitted: true,
        },
      },
    });

    const result = await adapter.handleWebhook(payload, header);

    expect(result.eventType).toBe("account.updated");
    expect(result.accountId).toBe("acct_123");
    expect(result.status.chargesEnabled).toBe(true);
    expect(result.status.payoutsEnabled).toBe(false);
  });

  test("rejects a tampered body", async () => {
    const { header } = await signed({ id: "evt_2", type: "account.updated", data: { object: {} } });
    const forged = JSON.stringify({
      id: "evt_2",
      type: "account.updated",
      data: { object: { id: "acct_evil" } },
    });
    await expect(adapter.handleWebhook(forged, header)).rejects.toThrow();
  });

  test("rejects a signature made with another secret", async () => {
    const payload = JSON.stringify({ id: "evt_3", type: "account.updated", data: { object: {} } });
    const header = await signer.webhooks.generateTestHeaderStringAsync({
      payload,
      secret: "whsec_other",
    });
    await expect(adapter.handleWebhook(payload, header)).rejects.toThrow();
  });
});
