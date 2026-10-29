import { Elysia } from "elysia";
// Shared auth types live in a leaf module to avoid a barrel<->impl import
// cycle. Imported for local use below and re-exported so external consumers
// keep importing them from the barrel.
import type { AuthUser, UserRole } from "./types.ts";

export { internalAuth } from "./internal-auth.ts";
export { internalServiceAuth } from "./internal-service-auth.ts";
export { jwtAuth } from "./jwt-auth.ts";
export type { AuthUser, UserRole } from "./types.ts";

/**
 * @deprecated Use `jwtAuth` directly instead.
 * Alias kept for backwards compatibility — delegates to jwtAuth.
 */
export { jwtAuth as authGuard } from "./jwt-auth.ts";

export { signAccessToken, loadActiveMemberships } from "./token-helpers.ts";
export type {
  AccessJwtSigner,
  VendorMembershipClaim,
  SignAccessTokenInput,
} from "./token-helpers.ts";

export { bumpTokenVersion, getCurrentTokenVersion } from "./token-version.ts";

export { bulkJobAccessGuard } from "./bulk-job-access.ts";
export { vendorMembership } from "./vendor-membership.ts";
export type { BulkAccessHelper, BulkJobAccessDecision, BulkJobScope } from "./bulk-job-access.ts";

export { PERMISSIONS, isPermission } from "./permissions.ts";
export type { Permission } from "./permissions.ts";

export { permissionMatrix, PermissionMatrix, bumpMatrixVersion } from "./permission-matrix.ts";

/**
 * Role guard factory — restricts access to specific roles.
 * Must be chained after `jwtAuth` so that `user` is populated in context.
 */
export const requireRole = (...roles: UserRole[]) =>
  new Elysia({ name: `role-guard-${roles.sort().join("-")}-${Date.now()}` }).onBeforeHandle(
    { as: "scoped" },
    (context: any) => {
      const { user, set } = context;
      if (!user) {
        set.status = 401;
        return {
          statusCode: 401,
          message: "Authentication required",
          error: "UNAUTHORIZED",
          timestamp: new Date().toISOString(),
        };
      }
      if (!roles.includes((user as AuthUser).role)) {
        set.status = 403;
        return {
          statusCode: 403,
          message: "Insufficient permissions",
          error: "FORBIDDEN",
          timestamp: new Date().toISOString(),
        };
      }
    },
  );
