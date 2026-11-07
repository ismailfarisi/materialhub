/**
 * Route ownership check: every route a module mounts must be reachable
 * through the public routing table (src/proxy.ts) and resolve to THAT module.
 * A route that resolves to another module (prefix shadowing) or to none is a
 * dead endpoint: the frontend gets 401/404 although the handler exists.
 *
 *   cd backend/apps/api && bun scripts/check-routes.ts
 *
 * Importing the modules opens Redis/BullMQ connections, so run it where Redis
 * is reachable (CI "Boot the API" job, or local dev infra). Exits 1 on any
 * mismatch.
 */
import { config } from "@materialhub/config";
import { type ModuleName, modules } from "../src/modules.ts";
import { resolveUpstream } from "../src/proxy.ts";

/** Mounted on purpose but never public. */
const NOT_PUBLIC: Array<{ module: ModuleName | "*"; pattern: RegExp; why: string }> = [
  { module: "*", pattern: /^\/internal\//, why: "module-to-module only (serviceFetch)" },
  { module: "integration", pattern: /^\/health$/, why: "shadowed by the API's own /health" },
];

const ownerByOrigin = new Map<string, ModuleName>();
for (const name of Object.keys(modules) as ModuleName[]) {
  ownerByOrigin.set(new URL(config.serviceUrl[name]).origin, name);
}

const problems: string[] = [];
let checked = 0;
for (const name of Object.keys(modules) as ModuleName[]) {
  for (const route of modules[name].routes) {
    const path = route.path.replace(/:[^/]+/g, "x").replace(/\*$/, "x");
    if (NOT_PUBLIC.some((e) => (e.module === "*" || e.module === name) && e.pattern.test(path))) {
      continue;
    }
    checked++;
    const upstream = resolveUpstream(path);
    const owner = upstream ? ownerByOrigin.get(new URL(upstream.target).origin) : undefined;
    if (owner !== name) {
      problems.push(
        `${route.method} ${route.path}: mounted by ${name}, routed to ${owner ?? "nothing"}`,
      );
    }
  }
}

if (problems.length) {
  console.error(`Route ownership check FAILED (${problems.length} of ${checked}):`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`Route ownership check passed: ${checked} public routes resolve to their module.`);
process.exit(0);
