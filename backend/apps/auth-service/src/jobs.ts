import { TokenCleanupService } from "./services/token-cleanup.service.ts";

/** Background work owned by the auth module. Called once by the monolith at boot. */
export function startAuthJobs(): void {
  // Expired/used token cleanup (runs on boot, then every 24h).
  const tokenCleanup = new TokenCleanupService();
  tokenCleanup.start();
}
