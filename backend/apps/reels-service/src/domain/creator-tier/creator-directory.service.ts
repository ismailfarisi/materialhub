import { AppDataSource } from "@materialhub/database";

/** One approved creator as the vendor directory shows them. `id` is the user
 *  id — the field `InviteToCollabModal` needs as `creator.id`. */
export interface CreatorDirectoryCard {
  id: string;
  display_name: string;
  bio: string;
  primary_category: string;
  avatar_url: string | null;
  intro_video_url: string | null;
  sample_count: number;
}

export interface CreatorDirectoryParams {
  search?: string | null;
  category?: string | null;
  limit?: number;
  offset?: number;
}

interface RawDirectoryRow {
  id: string;
  display_name: string;
  bio: string;
  primary_category: string;
  avatar_url: string | null;
  intro_video_url: string | null;
  sample_count: number | string;
}

/**
 * Lists approved creators for the vendor dashboard's Creators page.
 *
 * There is deliberately no vendorId parameter: every approved creator is
 * visible to every vendor, so there is nothing to scope. Route-level
 * `vendorMembership("analytics.read")` gates who may call this.
 *
 * Identity (name, bio, category) is read from the creator's latest APPROVED
 * creator_applications row, which the creator's own profile editor updates in
 * place — so it is current, not a frozen snapshot of what they applied with.
 */
export class CreatorDirectoryService {
  async list(params: CreatorDirectoryParams): Promise<{ items: CreatorDirectoryCard[] }> {
    // Same clamps as DiscoveryService.browse().
    const limit = Math.min(60, Math.max(1, Math.trunc(Number(params.limit)) || 24));
    const offset = Math.max(0, Math.trunc(Number(params.offset)) || 0);

    // $1 limit, $2 offset, then one placeholder per active filter.
    const args: unknown[] = [limit, offset];
    const filters: string[] = [];
    if (params.search) {
      // Escape ILIKE metacharacters so a search like "30%" or "SPF_50" is a
      // literal substring — same helper shape as DiscoveryService.browse().
      const escaped = params.search.replace(/[\\%_]/g, (m) => `\\${m}`);
      args.push(`%${escaped}%`);
      filters.push(
        `AND (ca.display_name ILIKE $${args.length} ESCAPE '\\'
              OR ca.bio ILIKE $${args.length} ESCAPE '\\')`,
      );
    }
    if (params.category) {
      args.push(params.category);
      filters.push(`AND ca.primary_category = $${args.length}`);
    }

    const sql = `
      SELECT u.id,
             ca.display_name,
             ca.bio,
             ca.primary_category,
             u.avatar_url,
             intro.video_url                        AS intro_video_url,
             COALESCE(samples.sample_count, 0)::int AS sample_count
        FROM users u
        JOIN LATERAL (
              SELECT a.display_name, a.bio, a.primary_category
                FROM creator_applications a
               WHERE a.user_id = u.id
                 AND a.status = 'approved'
                 AND a.deleted_at IS NULL
               ORDER BY a.reviewed_at DESC NULLS LAST, a.created_at DESC
               LIMIT 1
             ) ca ON TRUE
        LEFT JOIN LATERAL (
              SELECT v.video_url
                FROM creator_portfolio_videos v
               WHERE v.user_id = u.id AND v.kind = 'intro' AND v.deleted_at IS NULL
               ORDER BY v.created_at DESC
               LIMIT 1
             ) intro ON TRUE
        LEFT JOIN LATERAL (
              SELECT COUNT(*)::int AS sample_count
                FROM creator_portfolio_videos v
               WHERE v.user_id = u.id AND v.kind = 'sample' AND v.deleted_at IS NULL
             ) samples ON TRUE
       WHERE u.creator_tier <> 'regular' AND u.deleted_at IS NULL
       ${filters.join("\n       ")}
       ORDER BY (u.avatar_url IS NULL AND intro.video_url IS NULL), u.creator_tier_earned_at DESC NULLS LAST, u.created_at DESC
       LIMIT $1 OFFSET $2;
    `;

    const rows = await this.runQuery(sql, args);
    return { items: rows.map((r) => this.toCard(r)) };
  }

  /** The single raw-SQL call, extracted so unit tests can stub it without
   *  mocking AppDataSource — same seam as GraduationService.performDemotion. */
  protected async runQuery(sql: string, args: unknown[]): Promise<RawDirectoryRow[]> {
    return AppDataSource.query(sql, args);
  }

  private toCard(r: RawDirectoryRow): CreatorDirectoryCard {
    return {
      id: r.id,
      display_name: r.display_name,
      bio: r.bio,
      primary_category: r.primary_category,
      avatar_url: r.avatar_url ?? null,
      intro_video_url: r.intro_video_url ?? null,
      sample_count: Number(r.sample_count ?? 0),
    };
  }
}
