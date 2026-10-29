import type { BulkImportJob } from "@materialhub/database";
import { Elysia } from "elysia";
import type { VendorMembershipClaim } from "./token-helpers.ts";
import type { AuthUser, UserRole } from "./types.ts";

export type BulkJobScope = "own" | "vendor" | "platform";

export interface BulkJobAccessDecision {
  allowed: boolean;
  scope: BulkJobScope;
}

/**
 * Elysia plugin deriving a `bulkAccess` helper into context. Chain AFTER jwtAuth.
 *
 * Reads vendor memberships from JWT (`vendorMemberships` context value, populated by
 * `jwtAuth` post-Phase-2). No DB round-trip is made.
 *
 * Usage:
 *   .use(jwtAuth).use(bulkJobAccessGuard)
 *     .post("/bulk/uploads/initiate", async ({ body, bulkAccess, user }) => {
 *       const { vendorId } = await bulkAccess.assertCanCreate({ targetVendorId: body.targetVendorId });
 *       ...
 *     })
 */
export const bulkJobAccessGuard = new Elysia({ name: "bulk-job-access" })
  .derive({ as: "scoped" }, async (context: any) => {
    const { user, vendorMemberships, set } = context;
    if (!user) {
      set.status = 401;
      return {
        bulkAccess: null as unknown as BulkAccessHelper,
        _bulkAccessUnauthorized: true,
      };
    }

    const role = (user as AuthUser).role as UserRole;
    const memberships = (vendorMemberships ?? []) as VendorMembershipClaim[];
    const ownVendorIds = memberships.map((m) => m.vid);

    function http(statusCode: number, code: string): Error & { statusCode: number; code: string } {
      const err = new Error(code) as Error & { statusCode: number; code: string };
      err.statusCode = statusCode;
      err.code = code;
      return err;
    }

    const helper: BulkAccessHelper = {
      role,
      ownVendorIds,

      async assertCanCreate(args) {
        if (role === "super_admin") {
          return { vendorId: args.targetVendorId };
        }
        if (role === "admin") {
          if (!args.targetVendorId) throw http(400, "target_vendor_required");
          return { vendorId: args.targetVendorId };
        }
        if (ownVendorIds.length > 0) {
          const myVid = ownVendorIds[0] as string;
          if (args.targetVendorId && args.targetVendorId !== myVid) {
            throw http(403, "cannot_act_on_behalf_of_other_vendor");
          }
          return { vendorId: myVid };
        }
        throw http(403, "role_not_permitted");
      },

      async assertCanView(job: BulkImportJob) {
        if (role === "super_admin") return { allowed: true, scope: "platform" };
        if (role === "admin") return { allowed: true, scope: "vendor" };
        if (ownVendorIds.length > 0) {
          if (job.vendor_id !== ownVendorIds[0]) {
            throw http(403, "forbidden");
          }
          return { allowed: true, scope: "own" };
        }
        throw http(403, "forbidden");
      },
    };

    return { bulkAccess: helper, _bulkAccessUnauthorized: false };
  })
  .onBeforeHandle(({ set, _bulkAccessUnauthorized }: any) => {
    if (_bulkAccessUnauthorized) {
      set.status = 401;
      return {
        statusCode: 401,
        message: "Authentication required",
        error: "UNAUTHORIZED",
        timestamp: new Date().toISOString(),
      };
    }
  })
  .onError({ as: "scoped" }, ({ error, set }: any) => {
    const e = error as Error & { statusCode?: number; code?: string };
    if (e.statusCode) {
      set.status = e.statusCode;
      return {
        statusCode: e.statusCode,
        message: e.message,
        error: e.code ?? e.message,
        timestamp: new Date().toISOString(),
      };
    }
  });

export interface BulkAccessHelper {
  role: UserRole;
  ownVendorIds: string[]; // empty for super_admin/admin/users-without-membership
  assertCanCreate(args: { targetVendorId: string | null }): Promise<{ vendorId: string | null }>;
  assertCanView(job: BulkImportJob): Promise<BulkJobAccessDecision>;
}
