import { type VendorMembershipClaim, loadActiveMemberships } from "@materialhub/guards";

const ACTIVE_VENDOR_HEADER = "x-active-vendor-id";

export function activeVendorHeader(headers: Record<string, unknown> | undefined): string | null {
  const value = headers?.[ACTIVE_VENDOR_HEADER];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function resolveActiveVendorId(
  vendorMemberships: VendorMembershipClaim[] | undefined,
  headerVendorId: string | null | undefined,
): string | null {
  const memberships = vendorMemberships ?? [];
  if (headerVendorId) {
    return memberships.some((membership) => membership.vid === headerVendorId)
      ? headerVendorId
      : null;
  }

  return memberships.length === 1 ? memberships[0]!.vid : null;
}

/**
 * Resolve the caller's active vendor, falling back to a live `vendor_members`
 * lookup when the access token carries no usable membership claim.
 *
 * The JWT `vm` claim is the fast path, but a vendor whose token predates their
 * membership row (e.g. issued before vendor-membership phase 3b, or before
 * they accepted an invite) would have an empty claim and otherwise resolve to
 * `null` — leaving their reel tag picker empty. The DB fallback reuses the same
 * canonical query the token signer uses, so resolution stays consistent.
 */
export async function resolveActiveVendorIdWithFallback(
  vendorMemberships: VendorMembershipClaim[] | undefined,
  headerVendorId: string | null,
  userId: string,
  loadDbMemberships: (userId: string) => Promise<VendorMembershipClaim[]> = loadActiveMemberships,
): Promise<string | null> {
  const fromToken = resolveActiveVendorId(vendorMemberships, headerVendorId);
  if (fromToken) return fromToken;

  const dbMemberships = await loadDbMemberships(userId);
  return resolveActiveVendorId(dbMemberships, headerVendorId);
}
