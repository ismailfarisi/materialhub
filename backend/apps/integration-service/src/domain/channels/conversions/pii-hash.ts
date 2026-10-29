import { createHash } from "node:crypto";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function hashEmail(email: string): string {
  return sha256(email.trim().toLowerCase());
}

export function hashPhone(phone: string): string {
  // E.164: +CC followed by digits, no spaces or punctuation.
  const digits = phone.replace(/[^\d+]/g, "");
  const e164 = digits.startsWith("+") ? digits : `+${digits}`;
  return sha256(e164);
}

export function hashName(name: string): string {
  return sha256(name.trim().toLowerCase());
}

/** Address line for Enhanced Conversions — lowercase + collapse whitespace. */
export function hashAddressLine(value: string): string {
  return sha256(value.trim().toLowerCase().replace(/\s+/g, " "));
}
