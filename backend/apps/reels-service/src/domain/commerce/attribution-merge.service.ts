import { AppDataSource } from "@materialhub/database";
import type { DataSource } from "typeorm";

/**
 * Backfills `user_id` on `reel_attributions` and `reel_views` rows that were
 * written during an anonymous (guest-session) session, once the guest has
 * authenticated. Idempotent: re-running with the same (sessionId, userId) is
 * a no-op because the WHERE predicate filters on `user_id IS NULL`.
 *
 * View-conflict handling: `reel_views` has a partial unique on
 * `(user_id, reel_id) WHERE user_id IS NOT NULL`. If the user had already
 * watched the same reel while logged in, a straight UPDATE would violate
 * the constraint. Pre-delete the offending anon rows first.
 */
export class AttributionMergeService {
  constructor(private readonly dataSource: DataSource = AppDataSource) {}

  async mergeGuestToUser(guestSessionId: string, userId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `DELETE FROM "reel_views" v
          WHERE v."session_id" = $1 AND v."user_id" IS NULL
            AND EXISTS (
              SELECT 1 FROM "reel_views" v2
               WHERE v2."user_id" = $2 AND v2."reel_id" = v."reel_id"
            )`,
        [guestSessionId, userId],
      );
      await manager.query(
        `UPDATE "reel_views" SET "user_id" = $2, "session_id" = NULL
          WHERE "session_id" = $1 AND "user_id" IS NULL`,
        [guestSessionId, userId],
      );
      await manager.query(
        `UPDATE "reel_attributions" SET "user_id" = $2
          WHERE "session_id" = $1 AND "user_id" IS NULL`,
        [guestSessionId, userId],
      );
    });
  }
}
