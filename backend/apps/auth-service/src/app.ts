import { errorHandler, requestLogger } from "@materialhub/plugins";
import { Elysia } from "elysia";
import { container } from "./container.ts";
import { addressRoutes, verifiedPhoneRoutes } from "./routes/address.routes.ts";
import { adminBusinessRoutes } from "./routes/admin-business.routes.ts";
import { adminPasswordRoutes } from "./routes/admin-password.routes.ts";
import { adminUserRoutes } from "./routes/admin-user.routes.ts";
import { authRoutes } from "./routes/auth.routes.ts";
import { businessRoutes } from "./routes/business.routes.ts";
import { passwordRoutes } from "./routes/password.routes.ts";
import { twoFactorRoutes } from "./routes/two-factor.routes.ts";

export const app = new Elysia()
  .use(requestLogger)
  .use(errorHandler)
  .use(authRoutes)
  .use(passwordRoutes)
  .use(twoFactorRoutes)
  .use(adminUserRoutes)
  .use(addressRoutes)
  .use(verifiedPhoneRoutes)
  .use(businessRoutes)
  .use(adminBusinessRoutes)
  .use(adminPasswordRoutes(container));
