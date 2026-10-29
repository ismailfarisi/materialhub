import { AppDataSource, UserToken } from "@materialhub/database";

const RETENTION_DAYS = 7;
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

export class TokenCleanupService {
  private timer: ReturnType<typeof setInterval> | null = null;

  start() {
    // Run once on startup, then every 24 hours
    this.purgeExpiredTokens();
    this.timer = setInterval(() => this.purgeExpiredTokens(), CLEANUP_INTERVAL_MS);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async purgeExpiredTokens(): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);

    const tokenRepo = AppDataSource.getRepository(UserToken);

    // Delete tokens that are either expired or used, and older than the retention period
    const result = await tokenRepo
      .createQueryBuilder()
      .delete()
      .where("expires_at < :cutoff", { cutoff })
      .orWhere("used_at IS NOT NULL AND used_at < :cutoff", { cutoff })
      .execute();

    const deleted = result.affected ?? 0;
    if (deleted > 0) {
      console.log(`[token-cleanup] Purged ${deleted} expired/used tokens`);
    }

    return deleted;
  }
}
