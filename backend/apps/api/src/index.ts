import { config } from "@materialhub/config";
import { ensureDatabase } from "@materialhub/database";
import { permissionMatrix } from "@materialhub/guards";
import { app } from "./app.ts";
import { startAllJobs } from "./jobs.ts";
import { registerModules } from "./modules.ts";

/**
 * MaterialHub API: the whole backend in one process.
 *
 * The public app (./app.ts) keeps the former gateway's CORS, rate limiting,
 * JWT auth, swagger and path routing; it dispatches each request in-process to
 * the module that owns it (./modules.ts).
 */
await ensureDatabase();
await permissionMatrix.load();
permissionMatrix.startPolling();

const origins = registerModules();
await startAllJobs();

app.listen({
  port: config.port.gateway,
  idleTimeout: 255,
});

console.log(
  `[api] running at http://${app.server?.hostname}:${app.server?.port} (modules in-process: ${origins
    .map(([origin, name]) => `${name}=${origin}`)
    .join(", ")})`,
);

export type App = typeof app;
