import {
  AppDataSource,
  CreatorMediaKit,
  type CreatorMediaKitSegment,
  type CreatorMediaKitStat,
} from "@materialhub/database";
import type { Repository } from "typeorm";

/** Caps mirrored by the DTO and by CHECK constraints on the table. */
const STAT_LIMIT = 4;
const CONTENT_TYPE_LIMIT = 8;
const SEGMENT_LIMIT = 6;

export interface CreatorMediaKitInput {
  headline?: string | null;
  pull_quote?: string | null;
  about?: string | null;
  location_label?: string | null;
  collaboration_note?: string | null;
  stats?: CreatorMediaKitStat[];
  content_types?: string[];
  audience?: CreatorMediaKitSegment[];
  top_locations?: CreatorMediaKitSegment[];
}

/** One portfolio clip as the vendor page shows it. */
export interface MediaKitVideo {
  id: string;
  video_url: string;
  caption: string | null;
}

/**
 * The vendor-facing creator detail payload.
 *
 * Note what is absent: no social handles, no email, no phone. A vendor reaches
 * a creator through a collab invite and nothing else, so the contact fields
 * that DO exist on creator_applications (`social_links`) are never selected
 * here — not merely omitted from the type, but never read out of the database.
 */
export interface CreatorMediaKitDetail {
  id: string;
  display_name: string;
  bio: string;
  primary_category: string;
  avatar_url: string | null;
  /** True once the creator has saved a kit; false means the fields below are
   *  empty. Also false for a legacy kit saved before publishing was removed
   *  and never re-saved since. */
  has_media_kit: boolean;
  headline: string | null;
  pull_quote: string | null;
  about: string | null;
  location_label: string | null;
  collaboration_note: string | null;
  stats: CreatorMediaKitStat[];
  content_types: string[];
  audience: CreatorMediaKitSegment[];
  top_locations: CreatorMediaKitSegment[];
  intro_video_url: string | null;
  samples: MediaKitVideo[];
}

interface RawDetailRow {
  id: string;
  display_name: string;
  bio: string;
  primary_category: string;
  avatar_url: string | null;
  intro_video_url: string | null;
  kit: {
    headline: string | null;
    pull_quote: string | null;
    about: string | null;
    location_label: string | null;
    collaboration_note: string | null;
    stats: CreatorMediaKitStat[] | null;
    content_types: string[] | null;
    audience: CreatorMediaKitSegment[] | null;
    top_locations: CreatorMediaKitSegment[] | null;
    is_published: boolean;
  } | null;
  samples: MediaKitVideo[] | null;
}

export class CreatorMediaKitService {
  private kitRepo!: Repository<CreatorMediaKit>;

  constructor(kitRepo?: Repository<CreatorMediaKit>) {
    if (kitRepo) this.kitRepo = kitRepo;
  }

  private kits(): Repository<CreatorMediaKit> {
    if (!this.kitRepo) this.kitRepo = AppDataSource.getRepository(CreatorMediaKit);
    return this.kitRepo;
  }

  /** The caller's own kit, or null if they have never saved one. */
  async getMine(userId: string): Promise<CreatorMediaKit | null> {
    return this.kits().findOne({ where: { user_id: userId } });
  }

  /**
   * Creates or updates the caller's kit. Fields left out of `input` keep their
   * stored value — the editor saves one section at a time, so a PUT carrying
   * only `about` must not blank the rest of the page.
   */
  async upsert(userId: string, input: CreatorMediaKitInput): Promise<CreatorMediaKit> {
    const existing = await this.getMine(userId);
    const kit = existing ?? this.kits().create({ user_id: userId });

    if (input.headline !== undefined) kit.headline = trim(input.headline);
    if (input.pull_quote !== undefined) kit.pull_quote = trim(input.pull_quote);
    if (input.about !== undefined) kit.about = trim(input.about);
    if (input.location_label !== undefined) kit.location_label = trim(input.location_label);
    if (input.collaboration_note !== undefined) {
      kit.collaboration_note = trim(input.collaboration_note);
    }
    if (input.stats !== undefined) {
      kit.stats = input.stats
        .filter((s) => s.label.trim() !== "" && s.value.trim() !== "")
        .slice(0, STAT_LIMIT)
        .map((s) => ({ label: s.label.trim(), value: s.value.trim() }));
    }
    if (input.content_types !== undefined) {
      kit.content_types = input.content_types
        .map((c) => c.trim())
        .filter((c) => c !== "")
        .slice(0, CONTENT_TYPE_LIMIT);
    }
    if (input.audience !== undefined) kit.audience = cleanSegments(input.audience);
    if (input.top_locations !== undefined) kit.top_locations = cleanSegments(input.top_locations);

    // Saving is publishing. There is no draft state and no publish control in
    // the editor any more: what a creator saves is what a brand sees, so the
    // flag is forced true here rather than read from `input`. The column
    // survives because the vendor-facing query still joins on it — it is now
    // only ever false for a kit that predates this and has not been re-saved.
    kit.is_published = true;

    // A kit that has never been saved defaults its lists to [] rather than
    // relying on the column default, so the returned row matches what a
    // subsequent GET would produce.
    kit.stats ??= [];
    kit.content_types ??= [];
    kit.audience ??= [];
    kit.top_locations ??= [];

    return this.kits().save(kit);
  }

  /**
   * One approved creator's public detail page, as a vendor sees it.
   *
   * Returns null when the id is not an approved creator, so the route can 404
   * rather than leak the existence of a regular user's row.
   *
   * An unpublished kit is treated exactly like a missing one: identity and
   * videos still render (that is what the directory card already shows), but
   * every authored field comes back empty.
   */
  async getForVendor(userId: string): Promise<CreatorMediaKitDetail | null> {
    const sql = `
      SELECT u.id,
             ca.display_name,
             ca.bio,
             ca.primary_category,
             u.avatar_url,
             intro.video_url AS intro_video_url,
             -- Built field by field rather than to_jsonb(k.*): that would carry
             -- internal columns (user_id, deleted_at) into a vendor response,
             -- and its null-row behaviour on an unmatched LEFT JOIN is a
             -- footgun. The CASE makes "no published kit" an unambiguous NULL.
             CASE WHEN k.id IS NULL THEN NULL ELSE jsonb_build_object(
               'headline',           k.headline,
               'pull_quote',         k.pull_quote,
               'about',              k.about,
               'location_label',     k.location_label,
               'collaboration_note', k.collaboration_note,
               'stats',              k.stats,
               'content_types',      k.content_types,
               'audience',           k.audience,
               'top_locations',      k.top_locations,
               'is_published',       k.is_published
             ) END AS kit,
             samples.samples
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
              SELECT COALESCE(
                       jsonb_agg(
                         jsonb_build_object('id', v.id, 'video_url', v.video_url,
                                            'caption', v.caption)
                         ORDER BY v.created_at
                       ),
                       '[]'::jsonb
                     ) AS samples
                FROM creator_portfolio_videos v
               WHERE v.user_id = u.id AND v.kind = 'sample' AND v.deleted_at IS NULL
             ) samples ON TRUE
        LEFT JOIN creator_media_kits k
               ON k.user_id = u.id AND k.deleted_at IS NULL AND k.is_published = true
       WHERE u.id = $1
         AND u.creator_tier <> 'regular'
         AND u.deleted_at IS NULL
       LIMIT 1;
    `;

    const rows = await this.runQuery(sql, [userId]);
    const row = rows[0];
    if (!row) return null;

    const kit = row.kit;
    return {
      id: row.id,
      display_name: row.display_name,
      bio: row.bio,
      primary_category: row.primary_category,
      avatar_url: row.avatar_url ?? null,
      has_media_kit: kit !== null,
      headline: kit?.headline ?? null,
      pull_quote: kit?.pull_quote ?? null,
      about: kit?.about ?? null,
      location_label: kit?.location_label ?? null,
      collaboration_note: kit?.collaboration_note ?? null,
      stats: kit?.stats ?? [],
      content_types: kit?.content_types ?? [],
      audience: kit?.audience ?? [],
      top_locations: kit?.top_locations ?? [],
      intro_video_url: row.intro_video_url ?? null,
      samples: row.samples ?? [],
    };
  }

  /** The single raw-SQL call, extracted so unit tests can stub it without
   *  mocking AppDataSource — same seam as CreatorDirectoryService.list. */
  protected async runQuery(sql: string, args: unknown[]): Promise<RawDetailRow[]> {
    return AppDataSource.query(sql, args);
  }
}

function trim(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

function cleanSegments(segments: CreatorMediaKitSegment[]): CreatorMediaKitSegment[] {
  return segments
    .filter((s) => s.label.trim() !== "")
    .slice(0, SEGMENT_LIMIT)
    .map((s) => ({
      label: s.label.trim(),
      // Clamped rather than rejected: a slider or a typo shouldn't fail the
      // whole save, and a donut only ever renders 0-100.
      percent: Math.min(100, Math.max(0, Number(s.percent) || 0)),
    }));
}
