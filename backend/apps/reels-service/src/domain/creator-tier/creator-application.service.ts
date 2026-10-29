import {
  AppDataSource,
  CreatorApplication,
  CreatorApplicationStatus,
  CreatorTier,
  User,
} from "@materialhub/database";
import { MediaService } from "@materialhub/utils";
import { type EntityManager, In, type Repository } from "typeorm";

export interface ApplyDto {
  display_name: string;
  bio: string;
  primary_category: string;
  social_links: {
    instagram?: string | null;
    tiktok?: string | null;
    youtube?: string | null;
    other?: string | null;
  };
  follower_estimate?: number | null;
  sample_urls?: string[] | null;
  motivation?: string | null;
  agreed_to_terms: boolean;
}

const OPEN_STATUSES = [CreatorApplicationStatus.pending, CreatorApplicationStatus.needs_info];

export class CreatorApplicationService {
  private appRepo!: Repository<CreatorApplication>;
  private userRepo!: Repository<User>;
  private mediaService: MediaService;

  // Constructor injection is used by the mocked-repo unit tests. In production
  // the container calls `new CreatorApplicationService()` and repos resolve
  // lazily off AppDataSource on first use (container imports before ensureDatabase).
  constructor(
    appRepo?: Repository<CreatorApplication>,
    userRepo?: Repository<User>,
    mediaService: MediaService = new MediaService(),
  ) {
    if (appRepo) this.appRepo = appRepo;
    if (userRepo) this.userRepo = userRepo;
    this.mediaService = mediaService;
  }

  private apps(): Repository<CreatorApplication> {
    if (!this.appRepo) this.appRepo = AppDataSource.getRepository(CreatorApplication);
    return this.appRepo;
  }

  private users(): Repository<User> {
    if (!this.userRepo) this.userRepo = AppDataSource.getRepository(User);
    return this.userRepo;
  }

  /**
   * Submit a creator application. Rejected if the user is already a creator/
   * influencer, or already has an OPEN (pending|needs_info) application. The
   * partial unique index is the DB-level backstop; this check gives a clean
   * 409 instead of a raw constraint 500.
   */
  async apply(userId: string, dto: ApplyDto): Promise<CreatorApplication> {
    if (!dto.agreed_to_terms) throw new Error("terms_not_accepted");
    const user = await this.users().findOne({ where: { id: userId } });
    if (!user) throw new Error("user_not_found");
    if (user.creator_tier !== CreatorTier.regular) throw new Error("already_creator");
    const open = await this.apps().findOne({
      where: { user_id: userId, status: In(OPEN_STATUSES) },
    });
    if (open) throw new Error("application_open");

    const now = new Date();
    const app = this.apps().create({
      user_id: userId,
      status: CreatorApplicationStatus.pending,
      display_name: dto.display_name,
      bio: dto.bio,
      primary_category: dto.primary_category,
      social_links: dto.social_links ?? {},
      follower_estimate: dto.follower_estimate ?? null,
      sample_urls: dto.sample_urls ?? null,
      motivation: dto.motivation ?? null,
      agreed_to_terms_at: now,
      submitted_at: now,
    });
    return this.apps().save(app);
  }

  /** Latest application for the applicant status view. */
  async getMine(userId: string): Promise<CreatorApplication | null> {
    return this.apps().findOne({
      where: { user_id: userId },
      order: { created_at: "DESC" },
    });
  }

  async getById(id: string): Promise<CreatorApplication | null> {
    return this.apps().findOne({ where: { id } });
  }

  /** Creator edits their own profile in place — no separate history kept. */
  async updateProfile(
    userId: string,
    dto: {
      display_name?: string;
      bio?: string;
      social_links?: CreatorApplication["social_links"];
    },
  ): Promise<CreatorApplication> {
    const app = await this.apps().findOne({
      where: { user_id: userId },
      order: { created_at: "DESC" },
    });
    if (!app) throw new Error("application_not_found");
    if (dto.display_name !== undefined) app.display_name = dto.display_name;
    if (dto.bio !== undefined) app.bio = dto.bio;
    if (dto.social_links !== undefined) app.social_links = dto.social_links;
    return this.apps().save(app);
  }

  /** Presigns a direct-to-S3 upload for the caller's own avatar. */
  async presignAvatar(
    userId: string,
    filename: string,
    contentType: string,
  ): Promise<{ uploadUrl: string; key: string }> {
    const { uploadUrl, key } = await this.mediaService.generatePresignedUrlForAsset({
      assetType: "user_avatar",
      filename,
      contentType,
      userId,
    });
    return { uploadUrl, key };
  }

  /**
   * Processes the uploaded avatar and writes the resulting CDN URL onto
   * User.avatar_url — the same avatar shown across the whole site.
   */
  async finalizeAvatar(userId: string, key: string): Promise<string> {
    if (!key.startsWith(`users/${userId}/avatar/`)) {
      throw new Error("invalid_avatar_key");
    }
    const { url } = await this.mediaService.processAssetImage({
      assetType: "user_avatar",
      key,
    });
    await this.users().update({ id: userId }, { avatar_url: url });
    return url;
  }

  /** Admin review queue. */
  async listForReview(opts: {
    status?: CreatorApplicationStatus;
    page?: number;
    limit?: number;
  }): Promise<{ items: CreatorApplication[]; total: number }> {
    const page = opts.page && opts.page > 0 ? opts.page : 1;
    const limit = opts.limit && opts.limit > 0 ? Math.min(opts.limit, 100) : 20;
    const [items, total] = await this.apps().findAndCount({
      where: opts.status ? { status: opts.status } : {},
      order: { submitted_at: "DESC" },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total };
  }

  /**
   * Approve: in one transaction set app 'approved', promote the user to
   * creator (race-safe conditional UPDATE — only if still 'regular'; if the
   * user already graduated via the trigger the UPDATE is a no-op, which is
   * fine — the tier is already there), and write an audit row.
   */
  async approve(
    applicationId: string,
    adminId: string,
    actorRole: string,
  ): Promise<CreatorApplication> {
    return AppDataSource.transaction(async (manager) => {
      const app = await this.loadReviewable(manager, applicationId);
      await this.promoteUser(manager, app.user_id);
      const updated = await this.finalize(
        manager,
        app,
        CreatorApplicationStatus.approved,
        adminId,
        null,
      );
      await this.writeAudit(
        manager,
        adminId,
        actorRole,
        "creator_application_approved",
        applicationId,
        app.user_id,
        null,
      );
      return updated;
    });
  }

  /** Reject: set status + notes, NO tier change. */
  async reject(
    applicationId: string,
    adminId: string,
    actorRole: string,
    notes: string | null,
  ): Promise<CreatorApplication> {
    return AppDataSource.transaction(async (manager) => {
      const app = await this.loadReviewable(manager, applicationId);
      const updated = await this.finalize(
        manager,
        app,
        CreatorApplicationStatus.rejected,
        adminId,
        notes,
      );
      await this.writeAudit(
        manager,
        adminId,
        actorRole,
        "creator_application_rejected",
        applicationId,
        app.user_id,
        notes,
      );
      return updated;
    });
  }

  /** Request info: set status needs_info + notes, NO tier change. Stays OPEN. */
  async requestInfo(
    applicationId: string,
    adminId: string,
    actorRole: string,
    notes: string | null,
  ): Promise<CreatorApplication> {
    return AppDataSource.transaction(async (manager) => {
      const app = await this.loadReviewable(manager, applicationId);
      const updated = await this.finalize(
        manager,
        app,
        CreatorApplicationStatus.needs_info,
        adminId,
        notes,
      );
      await this.writeAudit(
        manager,
        adminId,
        actorRole,
        "creator_application_needs_info",
        applicationId,
        app.user_id,
        notes,
      );
      return updated;
    });
  }

  // ── protected seams (stubbed by unit tests) ──────────────────────────────

  protected async loadReviewable(manager: EntityManager, id: string): Promise<CreatorApplication> {
    const app = await manager.getRepository(CreatorApplication).findOne({ where: { id } });
    if (!app) throw new Error("application_not_found");
    if (
      app.status !== CreatorApplicationStatus.pending &&
      app.status !== CreatorApplicationStatus.needs_info
    ) {
      throw new Error("application_not_reviewable");
    }
    return app;
  }

  /**
   * Race-safe promotion: only flips a user still on 'regular'. If they already
   * graduated (trigger) the UPDATE affects 0 rows — intentional no-op. Mirrors
   * GraduationService.performDemotion.
   */
  protected async promoteUser(manager: EntityManager, userId: string): Promise<void> {
    await manager.query(
      `UPDATE "users"
         SET "creator_tier" = 'creator', "creator_tier_earned_at" = now()
       WHERE "id" = $1 AND "creator_tier" = 'regular'`,
      [userId],
    );
  }

  protected async finalize(
    manager: EntityManager,
    app: CreatorApplication,
    status: CreatorApplicationStatus,
    adminId: string,
    notes: string | null,
  ): Promise<CreatorApplication> {
    app.status = status;
    app.reviewed_by = adminId;
    app.reviewed_at = new Date();
    app.review_notes = notes;
    return manager.getRepository(CreatorApplication).save(app);
  }

  protected async writeAudit(
    manager: EntityManager,
    adminId: string,
    actorRole: string,
    action: string,
    applicationId: string,
    userId: string,
    notes: string | null,
  ): Promise<void> {
    await manager.query(
      `INSERT INTO "audit_log"
         ("actor_id", "actor_role", "action", "entity_type", "entity_id", "metadata")
       VALUES ($1, $2, $3, 'creator_application', $4, $5::jsonb)`,
      [adminId, actorRole, action, applicationId, JSON.stringify({ userId, notes })],
    );
  }
}
