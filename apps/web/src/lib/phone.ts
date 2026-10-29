// UAE phone helpers for form inputs. The storefront is UAE-only, so every phone
// field renders a fixed "+971" prefix and stores the full E.164 value. These two
// functions convert between what the user types (local digits) and what we store.
//
// (Distinct from lib/channels/phone.ts, which normalizes phones for analytics
// advanced-matching only and is not wired to any form.)

export const UAE_DIAL_CODE = "+971";

// Max significant digits after the country code (UAE mobiles are 9, landlines
// fewer; keep 10 to match the login form's historical cap and never truncate a
// valid number).
const MAX_LOCAL_DIGITS = 10;

/**
 * Convert user-typed local input into a stored E.164 value.
 * Strips non-digits and any leading zeros, caps length, prefixes +971.
 * Returns "" for empty input (so an untouched field doesn't store a bare "+971").
 */
export function toUaeE164(local: string): string {
  const digits = local
    .replace(/\D/g, "")
    .replace(/^0+/, "")
    .slice(0, MAX_LOCAL_DIGITS);
  return digits ? `${UAE_DIAL_CODE}${digits}` : "";
}

/**
 * Convert a stored value (E.164 "+971…", "00971…", "971…", or a legacy local
 * number) back into the local digits shown inside the input box.
 */
export function toLocalUaeDigits(stored: string): string {
  if (!stored) return "";
  let digits = stored.replace(/\D/g, "");
  if (digits.startsWith("00971")) digits = digits.slice(5);
  else if (digits.startsWith("971")) digits = digits.slice(3);
  digits = digits.replace(/^0+/, "");
  return digits.slice(0, MAX_LOCAL_DIGITS);
}
