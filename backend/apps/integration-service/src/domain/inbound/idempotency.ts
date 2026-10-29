import { createHash } from "node:crypto";

export function computeIdempotencyKey(headerValue: string | null, body: string): string {
  if (headerValue && headerValue.length > 0) return headerValue;
  return `sha256:${createHash("sha256").update(body).digest("hex")}`;
}
