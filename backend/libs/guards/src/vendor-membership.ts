import type { VendorMemberRole } from "@materialhub/database";
import { Elysia, status } from "elysia";
import { permissionMatrix } from "./permission-matrix.ts";
import type { Permission } from "./permissions.ts";
import type { VendorMembershipClaim } from "./token-helpers.ts";

const ACTIVE_VENDOR_HEADER = "x-active-vendor-id";

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Guards a route on vendor membership plus at least one of `permissions`.
 *
 * The plugin name must include every permission: Elysia dedupes plugins by
 * name, so two guards sharing one would collapse into a single instance.
 */
export const vendorMembership = (...permissions: Permission[]) =>
  new Elysia({ name: `vendor-membership-${permissions.join("+")}` }).derive(
    { as: "scoped" },
    async (context: any) => {
      const { user, vendorMemberships, headers } = context;
      if (!user) {
        return status(401, {
          statusCode: 401,
          message: "Authentication required",
          error: "UNAUTHORIZED",
          timestamp: nowIso(),
        });
      }

      const memberships = (vendorMemberships ?? []) as VendorMembershipClaim[];

      const headerVendorId =
        ((headers?.[ACTIVE_VENDOR_HEADER] ?? "") as string).trim() || undefined;

      let active: VendorMembershipClaim | undefined;
      if (headerVendorId) {
        active = memberships.find((m) => m.vid === headerVendorId);
        if (!active) {
          return status(403, {
            statusCode: 403,
            message: "Header X-Active-Vendor-Id does not match any membership",
            error: "INVALID_ACTIVE_VENDOR",
            timestamp: nowIso(),
          });
        }
      } else {
        if (memberships.length === 1) {
          active = memberships[0];
        } else {
          return status(400, {
            statusCode: 400,
            message:
              memberships.length === 0
                ? "No active vendor memberships for this user"
                : "Multiple memberships — X-Active-Vendor-Id header required",
            error: "MISSING_ACTIVE_VENDOR",
            timestamp: nowIso(),
          });
        }
      }

      if (!active) {
        // unreachable — earlier branches either assign or return
        throw new Error("vendorMembership: active is undefined after resolution");
      }

      const allowed = permissions.some((permission) =>
        permissionMatrix.has(active.r as VendorMemberRole, permission),
      );
      if (!allowed) {
        return status(403, {
          statusCode: 403,
          message: `Role ${active.r} lacks ${permissions.join(" or ")}`,
          error: "INSUFFICIENT_VENDOR_PERMISSION",
          timestamp: nowIso(),
        });
      }

      return { member: active };
    },
  );
