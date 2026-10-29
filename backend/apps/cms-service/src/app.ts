import { errorHandler, requestLogger } from "@materialhub/plugins";
import { Elysia } from "elysia";
import { auditRoutes } from "./routes/audit.routes.ts";
import { bannerRoutes } from "./routes/banner.routes.ts";
import { adminBidRoutes, vendorBidRoutes } from "./routes/bid.routes.ts";
import { adminHeaderNavRoutes } from "./routes/header-navigation.routes.ts";
import { layoutResolveRoutes } from "./routes/layout-resolve.routes.ts";
import { layoutRoutes } from "./routes/layout.routes.ts";
import { navigationRoutes } from "./routes/navigation.routes.ts";
import { pageRoutes } from "./routes/page.routes.ts";
import { publicSectionTypeRoutes, sectionTypeRoutes } from "./routes/section-type.routes.ts";
import { settingRoutes } from "./routes/setting.routes.ts";
import { slackSettingsRoutes } from "./routes/slack-settings.routes.ts";
import { slackWebhookRoutes } from "./routes/slack-webhook.routes.ts";
import { supportRoutes } from "./routes/support.routes.ts";
import { vendorLayoutRoutes } from "./routes/vendor-layout.routes.ts";

export const app = new Elysia()
  .use(requestLogger)
  .use(errorHandler)
  .use(pageRoutes)
  .use(bannerRoutes)
  .use(settingRoutes)
  .use(supportRoutes)
  .use(slackWebhookRoutes)
  .use(slackSettingsRoutes)
  .use(auditRoutes)
  .use(publicSectionTypeRoutes)
  .use(sectionTypeRoutes)
  .use(layoutRoutes)
  .use(layoutResolveRoutes)
  .use(vendorLayoutRoutes)
  .use(adminBidRoutes)
  .use(vendorBidRoutes)
  .use(adminHeaderNavRoutes)
  .use(navigationRoutes);
