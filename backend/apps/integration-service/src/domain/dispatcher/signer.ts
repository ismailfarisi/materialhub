import { createHmac, timingSafeEqual } from "node:crypto";

export function sign(secret: string, timestamp: string, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export function verify(
  secret: string,
  timestamp: string,
  body: string,
  signature: string,
): boolean {
  try {
    const expected = sign(secret, timestamp, body);
    const a = Buffer.from(signature, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
