import { beforeEach, describe, expect, it } from "bun:test";
import { createHmac } from "node:crypto";
import { config } from "@materialhub/config";
import { whatsappWebhookRoutes } from "./whatsapp-webhook.routes.ts";

// config is a frozen object but the whatsapp block's fields are plain data
// properties on a nested object — mutate via defineProperty-safe assignment.
const whatsappCfg = config.whatsapp as {
  webhookVerifyToken: string;
  appSecret: string;
};

const BASE = "http://localhost/webhooks/whatsapp";

function sign(body: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

const STATUS_PAYLOAD = JSON.stringify({
  entry: [
    {
      changes: [
        {
          value: {
            statuses: [{ id: "wamid.X", status: "delivered", recipient_id: "971501234567" }],
          },
        },
      ],
    },
  ],
});

describe("whatsapp webhook routes", () => {
  beforeEach(() => {
    whatsappCfg.webhookVerifyToken = "verify-me";
    whatsappCfg.appSecret = "app-secret";
  });

  describe("GET verification handshake", () => {
    it("echoes hub.challenge when the verify token matches", async () => {
      const res = await whatsappWebhookRoutes.handle(
        new Request(
          `${BASE}/?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=challenge-42`,
        ),
      );
      expect(res.status).toBe(200);
      expect(await res.text()).toBe("challenge-42");
    });

    it("403s on a wrong verify token", async () => {
      const res = await whatsappWebhookRoutes.handle(
        new Request(`${BASE}/?hub.mode=subscribe&hub.verify_token=WRONG&hub.challenge=x`),
      );
      expect(res.status).toBe(403);
    });

    it("403s when no verify token is configured (never verifies against empty string)", async () => {
      whatsappCfg.webhookVerifyToken = "";
      const res = await whatsappWebhookRoutes.handle(
        new Request(`${BASE}/?hub.mode=subscribe&hub.verify_token=&hub.challenge=x`),
      );
      expect(res.status).toBe(403);
    });
  });

  describe("POST delivery statuses", () => {
    it("accepts a correctly signed payload", async () => {
      const res = await whatsappWebhookRoutes.handle(
        new Request(`${BASE}/`, {
          method: "POST",
          headers: { "x-hub-signature-256": sign(STATUS_PAYLOAD, "app-secret") },
          body: STATUS_PAYLOAD,
        }),
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ received: true });
    });

    it("401s on a bad signature", async () => {
      const res = await whatsappWebhookRoutes.handle(
        new Request(`${BASE}/`, {
          method: "POST",
          headers: { "x-hub-signature-256": sign(STATUS_PAYLOAD, "wrong-secret") },
          body: STATUS_PAYLOAD,
        }),
      );
      expect(res.status).toBe(401);
    });

    it("401s on a missing signature header when a secret is configured", async () => {
      const res = await whatsappWebhookRoutes.handle(
        new Request(`${BASE}/`, { method: "POST", body: STATUS_PAYLOAD }),
      );
      expect(res.status).toBe(401);
    });

    it("still 200s an unparseable but correctly signed body (Meta retries on non-200)", async () => {
      const junk = "not-json";
      const res = await whatsappWebhookRoutes.handle(
        new Request(`${BASE}/`, {
          method: "POST",
          headers: { "x-hub-signature-256": sign(junk, "app-secret") },
          body: junk,
        }),
      );
      expect(res.status).toBe(200);
    });
  });
});
