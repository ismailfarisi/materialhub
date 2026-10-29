import { HttpError } from "@materialhub/plugins";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function assertNonOwnerRole(role: string): void {
  if (role === "owner") {
    throw new HttpError(
      422,
      "New owners are minted via transfer-ownership, not via invite",
      "INVITE_OWNER_NOT_ALLOWED",
    );
  }
}

export function assertVendorIdMatches(pathVendorId: string, activeVendorId: string): void {
  if (pathVendorId !== activeVendorId) {
    throw new HttpError(
      403,
      "Path vendorId does not match active membership",
      "INVALID_ACTIVE_VENDOR",
    );
  }
}
