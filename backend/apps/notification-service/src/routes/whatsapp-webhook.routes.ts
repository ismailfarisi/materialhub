import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "@materialhub/config";
import { Elysia } from "elysia";

/**
 * Meta WhatsApp Cloud API webhook. Two endpoints on one path, per Meta's
 * contract:
 *
 * - GET: one-time subscription verification — Meta sends our chosen
 *   verify token and expects the raw hub.challenge echoed back.
 * - POST: delivery-status events (sent/delivered/read/failed). v1 logs them
 *   only; a whatsapp_message_log table is a follow-up if ops need
 *   queryability.
 *
 * The POST body is read as RAW TEXT, not parsed JSON: X-Hub-Signature-256 is
 * an HMAC over the exact bytes Meta sent, so any reserialization breaks
 * verification.
 */

function verifySignature(rawBody: string, signatureHeader: string, appSecret: string): boolean {
  const expected = `sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const whatsappWebhookRoutes = new Elysia({ prefix: "/webhooks/whatsapp" })
  .get("/", ({ query, set }) => {
    const verifyToken = config.whatsapp.webhookVerifyToken;
    if (
      verifyToken &&
      query["hub.mode"] === "subscribe" &&
      query["hub.verify_token"] === verifyToken &&
      typeof query["hub.challenge"] === "string"
    ) {
      // Meta expects the bare challenge string back, not JSON.
      set.headers["content-type"] = "text/plain";
      return query["hub.challenge"];
    }
    set.status = 403;
    return { error: "verification failed" };
  })
  .post("/", async ({ request, set }) => {
    const rawBody = await request.text();
    const signature = request.headers.get("x-hub-signature-256") || "";
    const appSecret = config.whatsapp.appSecret;

    if (appSecret) {
      if (!signature || !verifySignature(rawBody, signature, appSecret)) {
        set.status = 401;
        return { error: "invalid signature" };
      }
    } else if (process.env.NODE_ENV === "production") {
      // Never accept unauthenticated webhooks in production.
      set.status = 403;
      return { error: "webhook not configured" };
    } else {
      console.warn(
        "[whatsapp-webhook] WHATSAPP_APP_SECRET unset; accepting unsigned POST (dev only)",
      );
    }

    // Log-only v1. Malformed payloads are logged and acknowledged — Meta
    // retries on any non-200, and a retry won't make a bad payload parse.
    try {
      const payload = JSON.parse(rawBody);
      for (const entry of payload.entry ?? []) {
        for (const change of entry.changes ?? []) {
          for (const status of change.value?.statuses ?? []) {
            console.log("[whatsapp-webhook] status", {
              messageId: status.id,
              status: status.status,
              recipientId: status.recipient_id,
              errors: status.errors,
            });
          }
        }
      }
    } catch {
      console.error("[whatsapp-webhook] unparseable payload", { length: rawBody.length });
    }

    return { received: true };
  });
