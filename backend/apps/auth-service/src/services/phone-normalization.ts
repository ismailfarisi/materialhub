import { HttpError } from "@materialhub/plugins";
import { normalizePhoneE164 } from "@materialhub/utils";

export function normalizePhoneForOtp(input: string): string {
  const normalized = normalizePhoneE164(input);
  if (!normalized) {
    throw new HttpError(400, "Invalid phone number", "INVALID_PHONE");
  }
  return normalized;
}
