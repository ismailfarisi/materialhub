import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "@materialhub/config";
import { Elysia } from "elysia";
import { container } from "../container.ts";

// Cloudflare Stream webhooks are signed per
// https://developers.cloudflare.com/stream/manage-video-library/receive-webhook-notifications/
//
// The `webhook-signature` header has the format: `time=TIMESTAMP,sig1=HEXSIG`
// where HEXSIG = HMAC-SHA256(secret, `TIMESTAMP.BODY`) and BODY is the raw
// request body bytes. Replay attacks are mitigated by rejecting timestamps
// older than a configurable freshness window.
const MAX_SIGNATURE_AGE_SECONDS = 300; // 5 minutes

interface ParsedSignature {
  timestamp: number;
  sig1: string;
}

function parseSignatureHeader(header: string): ParsedSignature | null {
  const parts = header.split(",").map((s) => s.trim());
  let timestamp: number | null = null;
  let sig1: string | null = null;
  for (const part of parts) {
    const [key, value] = part.split("=", 2);
    if (key === "time" && value) timestamp = Number(value);
    else if (key === "sig1" && value) sig1 = value;
  }
  if (timestamp == null || Number.isNaN(timestamp) || !sig1) return null;
  return { timestamp, sig1 };
}

function verifyCloudflareSignature(
  secret: string,
  signatureHeader: string,
  rawBody: string,
  now: number = Date.now(),
): { valid: true } | { valid: false; reason: string } {
  const parsed = parseSignatureHeader(signatureHeader);
  if (!parsed) return { valid: false, reason: "malformed_signature_header" };

  // Freshness / replay protection
  const ageSeconds = Math.abs(now / 1000 - parsed.timestamp);
  if (ageSeconds > MAX_SIGNATURE_AGE_SECONDS) {
    return { valid: false, reason: "stale_signature" };
  }

  // Reconstruct the signed payload: "TIMESTAMP.BODY"
  const signedPayload = `${parsed.timestamp}.${rawBody}`;
  const expected = createHmac("sha256", secret).update(signedPayload).digest("hex");

  // Timing-safe compare. Both buffers must be the same length.
  const expectedBuf = Buffer.from(expected, "utf8");
  const actualBuf = Buffer.from(parsed.sig1, "utf8");
  if (expectedBuf.length !== actualBuf.length) {
    return { valid: false, reason: "signature_length_mismatch" };
  }
  if (!timingSafeEqual(expectedBuf, actualBuf)) {
    return { valid: false, reason: "signature_mismatch" };
  }
  return { valid: true };
}

/**
 * Cloudflare Stream webhook endpoint.
 *
 * Elysia's default behaviour is to parse the request body according to the
 * declared schema (e.g. `t.Object`), which consumes `request.body` as a
 * stream. That prevents us from re-reading the raw bytes for HMAC
 * verification (`request.clone().text()` throws ERR_BODY_ALREADY_USED in
 * Bun because the clone shares the same already-consumed stream).
 *
 * Fix: declare `parse: ["text"]` so Elysia hands us the raw request body
 * as a string, then JSON.parse ourselves. This lets us verify the HMAC
 * against exactly the bytes Cloudflare signed.
 */
export const webhookRoutes = new Elysia({ prefix: "/reels/webhooks" }).use(container).post(
  "/cloudflare-stream",
  async ({ body, headers, webhookHandler, set }: any) => {
    // With parse: ["text"], body is the raw request body as a string.
    const rawBody: string = typeof body === "string" ? body : String(body ?? "");

    const secret = config.cloudflareStream?.webhookSecret ?? "";
    const signatureHeader = headers["webhook-signature"] as string | undefined;

    if (secret) {
      if (!signatureHeader) {
        set.status = 401;
        return {
          statusCode: 401,
          error: "missing_signature",
          timestamp: new Date().toISOString(),
        };
      }
      const result = verifyCloudflareSignature(secret, signatureHeader, rawBody);
      if (!result.valid) {
        set.status = 401;
        return {
          statusCode: 401,
          error: result.reason,
          timestamp: new Date().toISOString(),
        };
      }
    }

    // Cloudflare sends the video object at the top level — no eventType
    // wrapper. See docs + CloudflareStreamWebhookPayload in webhook.handler.ts.
    let event: { uid?: string; status?: { state?: string }; [k: string]: unknown };
    try {
      event = JSON.parse(rawBody);
    } catch {
      set.status = 400;
      return {
        statusCode: 400,
        error: "invalid_json",
        timestamp: new Date().toISOString(),
      };
    }

    if (!event.uid) {
      set.status = 400;
      return {
        statusCode: 400,
        error: "missing_uid",
        timestamp: new Date().toISOString(),
      };
    }

    // Single handler routes by status.state.
    await webhookHandler.handleNotification(event);

    return { statusCode: 200, timestamp: new Date().toISOString() };
  },
  {
    parse: ["text"],
  },
);

// Exported for unit testing.
export { parseSignatureHeader, verifyCloudflareSignature };
