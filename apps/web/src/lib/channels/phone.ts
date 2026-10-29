/**
 * Normalize a phone string to E.164 with the UAE country code.
 * - Strip non-digits except the leading "+".
 * - If no "+", prefix the UAE country code (971).
 * - Handles 00971 international-dial prefix, plain 971, and leading 0 (UAE local).
 *
 * Shared by Meta + TikTok Advanced Matching hooks (both pass raw normalized
 * values; the respective Pixel hashes them browser-side).
 */
export function normalizeUaePhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("00971")) return `+971${digits.slice(5)}`;
  if (digits.startsWith("971")) return `+${digits}`;
  if (digits.startsWith("0")) return `+971${digits.slice(1)}`;
  return `+971${digits}`;
}
