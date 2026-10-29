const E164_RE = /^\+[1-9]\d{7,14}$/;
const UAE_LOCAL_MOBILE_RE = /^0(5\d{8})$/;

/**
 * Normalize a phone number to E.164, converting UAE local mobile format
 * (05x xxx xxxx) to +971. Returns null when the input can't be normalized —
 * callers that need an HTTP 400 wrap this (auth-service's
 * normalizePhoneForOtp); callers that must skip silently (notification
 * dispatch to a stored profile phone) check for null.
 */
export function normalizePhoneE164(input: string): string | null {
  const trimmed = input.trim().replace(/[\s()-]/g, "");
  const localMatch = trimmed.match(UAE_LOCAL_MOBILE_RE);
  const normalized = localMatch ? `+971${localMatch[1]}` : trimmed;
  return E164_RE.test(normalized) ? normalized : null;
}
