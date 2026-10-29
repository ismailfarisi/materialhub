import { errorHandler, requestLogger } from "@materialhub/plugins";
import { Elysia } from "elysia";
import { adminPendingWritesRoutes } from "./routes/admin-pending-writes.routes.ts";
import { channelsAdminRoutes } from "./routes/channels-admin.routes.ts";
import { healthRoutes } from "./routes/health.routes.ts";
import { inboundRoutes } from "./routes/inbound.routes.ts";
import { replayRoutes } from "./routes/replay.routes.ts";
import { sourceSchemasRoutes } from "./routes/source-schemas.routes.ts";
import { vendorIntegrationsRoutes } from "./routes/vendor-integrations.routes.ts";
import { vendorMappingsRoutes } from "./routes/vendor-mappings.routes.ts";

export const app = new Elysia()
  .use(requestLogger)
  .use(errorHandler)
  .use(healthRoutes)
  .use(vendorIntegrationsRoutes)
  .use(vendorMappingsRoutes)
  .use(inboundRoutes)
  .use(sourceSchemasRoutes)
  .use(adminPendingWritesRoutes)
  .use(channelsAdminRoutes)
  .use(replayRoutes);
