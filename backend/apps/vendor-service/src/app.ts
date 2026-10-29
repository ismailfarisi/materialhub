import { errorHandler, requestLogger } from "@materialhub/plugins";
import { Elysia } from "elysia";
import { adminAffiliatesRoutes } from "./routes/admin-affiliates.routes.ts";
import { affiliatePublicRoutes } from "./routes/affiliate-public.routes.ts";
import { meAffiliateRoutes } from "./routes/me-affiliate.routes.ts";
import { rolePermissionsAdminRoutes } from "./routes/role-permissions-admin.routes.ts";
import { vendorAdminRoutes } from "./routes/vendor-admin.routes.ts";
import { vendorAffiliatesRoutes } from "./routes/vendor-affiliates.routes.ts";
import { vendorFollowRoutes } from "./routes/vendor-follow.routes.ts";
import { vendorInvitesRoutes } from "./routes/vendor-invites.routes.ts";
import { vendorMembersRoutes } from "./routes/vendor-members.routes.ts";
import { vendorReelsProgramRoutes } from "./routes/vendor-reels-program.routes.ts";
import { vendorWebhookRoutes } from "./routes/vendor-webhook.routes.ts";
import { vendorRoutes } from "./routes/vendor.routes.ts";

export const app = new Elysia()
  .use(requestLogger)
  .use(errorHandler)
  .use(vendorRoutes)
  .use(vendorAdminRoutes)
  .use(rolePermissionsAdminRoutes)
  .use(vendorReelsProgramRoutes)
  .use(vendorFollowRoutes)
  .use(vendorMembersRoutes)
  .use(vendorInvitesRoutes)
  .use(vendorWebhookRoutes)
  .use(vendorAffiliatesRoutes)
  .use(meAffiliateRoutes)
  .use(adminAffiliatesRoutes)
  .use(affiliatePublicRoutes);
