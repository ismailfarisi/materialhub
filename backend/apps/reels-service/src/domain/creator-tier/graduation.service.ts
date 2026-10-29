import { AppDataSource, CreatorTier, User } from "@materialhub/database";
import { type EntityManager, MoreThan, Not, type Repository } from "typeorm";

export class GraduationService {
  private userRepo!: Repository<User>;

  private getRepo(): Repository<User> {
    if (!this.userRepo) this.userRepo = AppDataSource.getRepository(User);
    return this.userRepo;
  }

  /**
   * List creators whose graduation is still inside the admin veto window.
   * Returns users where creator_tier != 'regular' and creator_tier_earned_at
   * is newer than (now - windowHours). Capped at 100 rows, newest first.
   *
   * The admin veto window itself is stored in
   * site_settings.reels_admin_veto_window_hours (seeded at 48h); callers
   * pass that value in.
   */
  async listVetoCandidates(windowHours: number): Promise<User[]> {
    const since = new Date(Date.now() - windowHours * 3600 * 1000);
    return this.getRepo().find({
      where: {
        creator_tier: Not(CreatorTier.regular) as any,
        creator_tier_earned_at: MoreThan(since) as any,
      },
      order: { creator_tier_earned_at: "DESC" },
      take: 100,
    });
  }

  /**
   * Demote a graduated creator back to regular tier and write an audit row.
   * Called by the admin veto route (Task 4) within the veto window. After
   * the window closes the veto is no longer available at the route layer.
   *
   * `adminId` is the acting admin's user id (goes to audit_log.actor_id).
   * `actorRole` is the admin's JWT role ('admin' or 'super_admin'), stored
   * in audit_log.actor_role so we know which class of operator acted.
   * `reason` is free-form text from the admin, stored in audit_log.metadata.
   *
   * Concurrency: the demotion is a conditional UPDATE guarded by
   * `creator_tier != 'regular'`. This makes concurrent vetoes race-safe —
   * exactly one click wins and writes the audit row; the loser's UPDATE
   * affects zero rows and the whole transaction aborts before the audit
   * INSERT runs. Compliance-grade: no duplicate audit rows.
   *
   * Transactionality: the conditional UPDATE and the audit INSERT run in a
   * single `AppDataSource.transaction` so the audit row is only committed
   * if the demotion commits (and vice versa).
   */
  async vetoCreator(
    userId: string,
    adminId: string,
    actorRole: string,
    reason: string,
  ): Promise<void> {
    await AppDataSource.transaction(async (manager) => {
      const demoted = await this.performDemotion(manager, userId);
      if (!demoted) throw new Error("user_not_found_or_already_regular");
      await this.writeAudit(manager, adminId, userId, actorRole, reason);
    });
  }

  /**
   * Conditional UPDATE that demotes a user to `regular` iff they are
   * currently on a higher tier. Returns `true` when exactly one row was
   * affected (the demotion happened), `false` otherwise (user doesn't
   * exist, or was already regular — could be a concurrent veto that beat
   * us, or a stale UI click).
   *
   * Protected so unit tests can stub it without mocking raw SQL.
   */
  protected async performDemotion(manager: EntityManager, userId: string): Promise<boolean> {
    const rows: unknown[] = await manager.query(
      `UPDATE "users"
         SET "creator_tier" = 'regular', "creator_tier_earned_at" = NULL
       WHERE "id" = $1 AND "creator_tier" != 'regular'
       RETURNING *`,
      [userId],
    );
    return rows.length === 1;
  }

  /**
   * Write a creator_veto audit row. Extracted as a protected method so
   * unit tests can stub it without mocking AppDataSource.query.
   *
   * audit_log schema (from backend/libs/database/src/entities/audit-log.entity.ts):
   *   actor_id     uuid nullable
   *   actor_role   varchar(50) NOT NULL   -- real JWT role from the route
   *                                          handler ('admin' or 'super_admin')
   *   action       varchar(100) NOT NULL
   *   entity_type  varchar(100) NOT NULL
   *   entity_id    uuid nullable          -- target user id
   *   metadata     jsonb nullable         -- { reason }
   */
  protected async writeAudit(
    manager: EntityManager,
    adminId: string,
    userId: string,
    actorRole: string,
    reason: string,
  ): Promise<void> {
    await manager.query(
      `INSERT INTO "audit_log"
         ("actor_id", "actor_role", "action", "entity_type", "entity_id", "metadata")
       VALUES ($1, $2, 'creator_veto', 'user', $3, $4::jsonb)`,
      [adminId, actorRole, userId, JSON.stringify({ reason })],
    );
  }
}
