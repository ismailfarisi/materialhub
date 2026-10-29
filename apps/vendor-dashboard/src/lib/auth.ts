const COOKIE_ACCESS_TOKEN = "vendor_access_token";

export interface VendorMembership {
  vid: string;
  r: "owner" | "manager" | "staff" | "viewer";
}

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Decode the JWT in the access-token cookie WITHOUT verifying its signature
 * (server is the only verifier). Returns the `vm` (vendor memberships) claim,
 * or [] when the cookie is missing / malformed / lacks the claim.
 */
export function getMembershipsFromToken(): VendorMembership[] {
  const token = getCookie(COOKIE_ACCESS_TOKEN);
  if (!token) return [];
  try {
    const parts = token.split(".");
    if (parts.length < 2) return [];
    const payload = JSON.parse(atob(parts[1]));
    return Array.isArray(payload.vm) ? payload.vm : [];
  } catch {
    return [];
  }
}
