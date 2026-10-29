import { swagger } from "@elysiajs/swagger";
import { errorHandler, requestLogger } from "@materialhub/plugins";
import { Elysia } from "elysia";

import { adminAnalyticsRoutes } from "./routes/admin-analytics.routes.ts";
import { adminCollabRoutes } from "./routes/admin-collab.routes.ts";
import { attributionMergeRoutes } from "./routes/attribution-merge.routes.ts";
import { attributionRoutes } from "./routes/attribution.routes.ts";
import { collabBoardPublicRoutes } from "./routes/collab-board-public.routes.ts";
import { collabCreatorRoutes } from "./routes/collab-creator.routes.ts";
import { collabVendorRoutes } from "./routes/collab-vendor.routes.ts";
import { creatorApplicationRoutes } from "./routes/creator-application.routes.ts";
import { creatorDashboardRoutes } from "./routes/creator-dashboard.routes.ts";
import { creatorDirectoryRoutes } from "./routes/creator-directory.routes.ts";
import { creatorMediaKitRoutes } from "./routes/creator-media-kit.routes.ts";
import { creatorPortfolioRoutes } from "./routes/creator-portfolio.routes.ts";
import { creatorVetoRoutes } from "./routes/creator-veto.routes.ts";
import { discoveryRoutes } from "./routes/discovery.routes.ts";
import { feedRoutes } from "./routes/feed.routes.ts";
import { licensingBriefsPublicRoutes } from "./routes/licensing-briefs-public.routes.ts";
import { licensingCreatorRoutes } from "./routes/licensing-creator.routes.ts";
import { licensingFeaturedRoutes } from "./routes/licensing-featured.routes.ts";
import { licensingVendorRoutes } from "./routes/licensing-vendor.routes.ts";
import { moderationRoutes } from "./routes/moderation.routes.ts";
import { meReelsRoutes, reelsTagRoutes } from "./routes/reels-tag.routes.ts";
import { reelsRoutes } from "./routes/reels.routes.ts";
import { shortlistRoutes } from "./routes/shortlist.routes.ts";
import { socialRoutes } from "./routes/social.routes.ts";
import { taggingPermissionsRoutes } from "./routes/tagging-permissions.routes.ts";
import { userProfileRoutes } from "./routes/user-profile.routes.ts";
import { vendorAnalyticsRoutes } from "./routes/vendor-analytics.routes.ts";
import { webhookRoutes } from "./routes/webhook.routes.ts";

export const app = new Elysia()
  .use(requestLogger)
  .use(errorHandler)
  .use(
    swagger({
      path: "/api/docs",
      documentation: {
        info: { title: "Reels Service", version: "0.1.0" },
      },
    }),
  )
  .get("/health", () => ({ status: "ok", service: "reels" }))
  .use(feedRoutes)
  .use(reelsRoutes)
  .use(reelsTagRoutes)
  .use(meReelsRoutes)
  .use(attributionRoutes)
  .use(attributionMergeRoutes)
  .use(creatorDashboardRoutes)
  .use(creatorApplicationRoutes)
  .use(creatorPortfolioRoutes)
  .use(collabVendorRoutes)
  .use(collabCreatorRoutes)
  .use(collabBoardPublicRoutes)
  .use(adminCollabRoutes)
  .use(creatorVetoRoutes)
  .use(socialRoutes)
  .use(userProfileRoutes)
  .use(moderationRoutes)
  .use(taggingPermissionsRoutes)
  .use(adminAnalyticsRoutes)
  .use(vendorAnalyticsRoutes)
  .use(discoveryRoutes)
  .use(shortlistRoutes)
  .use(creatorDirectoryRoutes)
  .use(creatorMediaKitRoutes)
  .use(licensingVendorRoutes)
  .use(licensingCreatorRoutes)
  .use(licensingFeaturedRoutes)
  .use(licensingBriefsPublicRoutes)
  .use(webhookRoutes);
