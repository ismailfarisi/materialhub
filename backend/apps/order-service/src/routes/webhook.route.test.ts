/**
 * Route-level test for POST /webhooks/stripe and POST /webhooks/tamara.
 *
 * Imports the REAL webhook.routes.ts behind the module's errorHandler, with
 * mock.module("../container.ts") injecting a checkoutController backed by a
 * real WebhookService over in-memory repos — so the HTTP status codes
 * (200 / 400 / 503) and the "nothing written" guarantees are exercised
 * end-to-end without a database.
 */
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { errorHandler } from "@materialhub/plugins";
import { Elysia } from "elysia";
import Stripe from "stripe";
import { CheckoutController } from "../domain/checkout/checkout.controller.ts";
import { WebhookService } from "../domain/checkout/webhook.service.ts";

const SECRET = "whsec_materialhub_route_test";

const ledger = new Map<string, any>();
const webhookRepo = {
  findOne: mock(async ({ where }: any) => ledger.get(`${where.gateway}:${where.event_id}`) ?? null),
  save: mock(async (row: any) => {
    const saved = { id: row.id ?? `wh_${ledger.size + 1}`, ...row };
    ledger.set(`${saved.gateway}:${saved.event_id}`, saved);
    return saved;
  }),
};
// The PaymentIntent the server created for ord-1 (amount checked on success).
const paymentRepo = {
  findOne: mock(async () => ({ id: "pay-1", order_id: "ord-1", amount: 15000 })),
  save: mock(async (p: any) => p),
};
const orderConfirmation = { markOrderPaid: mock(async () => ({ confirmed: true })) };

const stripeConfig = { webhooks: Stripe.webhooks, secret: SECRET };
const webhookService = new WebhookService(
  webhookRepo as any,
  paymentRepo as any,
  orderConfirmation as any,
  undefined,
  { apiBaseUrl: "https://api-sandbox.tamara.co" },
  stripeConfig,
);
const checkoutController = new CheckoutController({} as any, webhookService);

mock.module("../container.ts", () => ({
  container: new Elysia({ name: "order-service-container" }).decorate(
    "checkoutController",
    checkoutController,
  ),
}));

const { webhookRoutes } = await import("./webhook.routes.ts");
const app = new Elysia().use(errorHandler).use(webhookRoutes);

const event = {
  id: "evt_route_1",
  object: "event",
  type: "payment_intent.succeeded",
  data: {
    object: {
      id: "pi_route",
      object: "payment_intent",
      amount_received: 15000,
      metadata: { order_id: "ord-1" },
    },
  },
};

async function postStripe(body: string, signature?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (signature !== undefined) headers["stripe-signature"] = signature;
  return app.handle(
    new Request("http://localhost/webhooks/stripe", { method: "POST", headers, body }),
  );
}

async function sign(payload: string, secret = SECRET) {
  return Stripe.webhooks.generateTestHeaderStringAsync({ payload, secret });
}

beforeEach(() => {
  ledger.clear();
  stripeConfig.secret = SECRET;
  for (const m of [webhookRepo.findOne, webhookRepo.save, orderConfirmation.markOrderPaid]) {
    m.mockClear();
  }
});

describe("POST /webhooks/stripe", () => {
  test("200 and processes an event with a valid signature", async () => {
    const payload = JSON.stringify(event);
    const res = await postStripe(payload, await sign(payload));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ received: true, skipped: false });
    expect(orderConfirmation.markOrderPaid).toHaveBeenCalledWith("ord-1");
    expect(ledger.get("stripe:evt_route_1")?.status).toBe("processed");
  });

  test("400 INVALID_SIGNATURE for a forged event (the original attack)", async () => {
    const payload = JSON.stringify(event);
    const res = await postStripe(payload, await sign(payload, "whsec_attacker"));
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).error).toBe("INVALID_SIGNATURE");
    expect(webhookRepo.save).not.toHaveBeenCalled();
    expect(orderConfirmation.markOrderPaid).not.toHaveBeenCalled();
  });

  test("400 INVALID_SIGNATURE when the stripe-signature header is missing", async () => {
    const res = await postStripe(JSON.stringify(event));
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).error).toBe("INVALID_SIGNATURE");
    expect(webhookRepo.save).not.toHaveBeenCalled();
  });

  test("503 STRIPE_WEBHOOK_NOT_CONFIGURED when the secret is unset", async () => {
    stripeConfig.secret = "";
    const origError = console.error;
    console.error = (() => {}) as any;
    let res: Response;
    try {
      const payload = JSON.stringify(event);
      res = await postStripe(payload, await sign(payload));
    } finally {
      console.error = origError;
    }
    expect(res.status).toBe(503);
    expect(((await res.json()) as any).error).toBe("STRIPE_WEBHOOK_NOT_CONFIGURED");
    expect(webhookRepo.findOne).not.toHaveBeenCalled();
    expect(webhookRepo.save).not.toHaveBeenCalled();
  });

  test("a replay of the same event id is skipped", async () => {
    const payload = JSON.stringify(event);
    const first = await postStripe(payload, await sign(payload));
    expect(first.status).toBe(200);

    const second = await postStripe(payload, await sign(payload));
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ received: true, skipped: true });
    expect(orderConfirmation.markOrderPaid).toHaveBeenCalledTimes(1);
  });
});

describe("POST /webhooks/tamara", () => {
  test("400 for an empty object, nothing written", async () => {
    const res = await app.handle(
      new Request("http://localhost/webhooks/tamara", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
    );
    expect(res.status).toBe(400);
    expect(webhookRepo.save).not.toHaveBeenCalled();
  });

  test("400 for a non-JSON body", async () => {
    const res = await app.handle(
      new Request("http://localhost/webhooks/tamara", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not json",
      }),
    );
    expect(res.status).toBe(400);
    expect(webhookRepo.save).not.toHaveBeenCalled();
  });
});
