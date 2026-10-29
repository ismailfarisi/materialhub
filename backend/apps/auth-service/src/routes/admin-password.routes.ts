import { jwtAuth, requireRole } from "@materialhub/guards";
import { auditPlugin } from "@materialhub/plugins";
import { Elysia, t } from "elysia";

export const adminPasswordRoutes = (container: any) =>
  new Elysia({ prefix: "/admin/auth" })
    .use(container)
    .use(jwtAuth)
    .use(requireRole("super_admin"))
    .use(auditPlugin)
    .derive({ as: "scoped" }, ({ audit }) => ({
      audit: {
        ...audit,
        action: "vendor.password_reset",
        entity_type: "vendor",
      },
    }))
    .post(
      "/vendors/:vendorId/reset-password",
      async ({ params, user, adminPasswordController }) => {
        const result = await adminPasswordController.resetVendorPassword(params.vendorId, user!.id);
        return {
          statusCode: 200,
          message: result.message,
          data: { vendor_email: result.vendor_email },
          timestamp: new Date().toISOString(),
        };
      },
      {
        params: t.Object({
          vendorId: t.String({ format: "uuid" }),
        }),
        detail: {
          tags: ["Admin", "Auth"],
          summary: "Reset vendor password",
          description:
            "Sends a password reset email to the vendor. Only accessible by super_admins.",
        },
      },
    )
    .post(
      "/vendors/:vendorId/set-password",
      async ({ params, user, adminPasswordController, audit }) => {
        // Override audit action for this endpoint (entity_type is already "vendor"
        // from the parent .derive — no need to re-set it).
        audit.action = "vendor.password_set_directly";

        const result = await adminPasswordController.setVendorPasswordDirectly(
          params.vendorId,
          user!.id,
        );
        return {
          statusCode: 200,
          message: "Vendor password set successfully",
          data: {
            vendor_email: result.vendor_email,
            temporary_password: result.temporary_password,
          },
          timestamp: new Date().toISOString(),
        };
      },
      {
        params: t.Object({
          vendorId: t.String({ format: "uuid" }),
        }),
        detail: {
          tags: ["Admin", "Auth"],
          summary: "Set vendor password directly",
          description:
            "Generates a strong temporary password, sets it on the vendor account, revokes active sessions, and returns the password ONCE. Vendor must change it on next login. Only accessible by super_admins.",
        },
      },
    );
