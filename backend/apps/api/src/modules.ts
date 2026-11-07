import { config } from "@materialhub/config";
import { registerInProcessService } from "@materialhub/utils/src/service-fetch.ts";
import { app as authApp } from "../../auth-service/src/app.ts";
import { app as cmsApp } from "../../cms-service/src/app.ts";
import { app as integrationApp } from "../../integration-service/src/app.ts";
import { app as notificationApp } from "../../notification-service/src/app.ts";
import { app as orderApp } from "../../order-service/src/app.ts";
import { app as productApp } from "../../product-service/src/app.ts";
import { app as vendorApp } from "../../vendor-service/src/app.ts";

/**
 * The backend modules that make up the monolith. Each keeps its own Elysia app
 * (plugins, error handling, route table), exactly as when it ran as its own
 * service; the public app in ./app.ts dispatches to them in-process.
 */
export const modules = {
  auth: authApp,
  product: productApp,
  order: orderApp,
  vendor: vendorApp,
  notification: notificationApp,
  cms: cmsApp,
  integration: integrationApp,
} as const;

export type ModuleName = keyof typeof modules;

/**
 * Serve every module's origin in-process, so the gateway routing in
 * ./proxy.ts and module-to-module calls (serviceFetch) never leave the process.
 * Returns the registered origin → module pairs (for the boot log).
 */
export function registerModules(): Array<[string, ModuleName]> {
  const registered: Array<[string, ModuleName]> = [];
  const register = (origin: string, name: ModuleName) => {
    const mod = modules[name];
    registerInProcessService(origin, (request) => mod.handle(request));
    registered.push([new URL(origin).origin, name]);
  };

  for (const name of Object.keys(modules) as ModuleName[]) {
    register(config.serviceUrl[name], name);
  }
  // Older env files may set NOTIFICATION_SERVICE_URL to a separate host; it
  // must still resolve to the in-process notification module.
  const notificationOrigin = new URL(config.internal.notificationServiceUrl).origin;
  if (notificationOrigin !== new URL(config.serviceUrl.notification).origin) {
    register(notificationOrigin, "notification");
  }
  return registered;
}
