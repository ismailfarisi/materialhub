import { AppDataSource } from "@materialhub/database";

export interface DiscoveryCard {
  id: string;
  video_playback_url: string;
  thumbnail_url: string;
  video_duration_seconds: number;
  language_code: string;
  caption: string | null;
  published_at: string | null;
  created_at: string;
  creator: { id: string; name: string };
  tagged_products: Array<{ id: string; name: string }>;
  engagement: { views: number; likes: number; saves: number; shares: number };
  /** Present ONLY in `mine()` — never in `browse()` (privacy). */
  attributed?: { orders: number; gmv_fils: number; product_taps: number };
  is_shortlisted: boolean;
}

export type MineSort = "recent" | "most_viewed" | "most_gmv" | "most_taps";
const MINE_SORT_SQL: Record<MineSort, string> = {
  recent: "r.published_at DESC NULLS LAST, r.created_at DESC",
  most_viewed: "r.view_count DESC",
  most_gmv: "attributed_gmv_fils DESC",
  most_taps: "product_taps DESC",
};

export interface MineParams {
  vendorId: string;
  sort?: MineSort;
  productId?: string | null;
  limit?: number;
  offset?: number;
}

interface RawMineRow {
  id: string;
  video_playback_url: string;
  thumbnail_url: string;
  video_duration_seconds: number;
  language_code: string;
  caption: string | null;
  published_at: string | null;
  created_at: string;
  creator_id: string;
  creator_name: string;
  tagged_products: Array<{ id: string; name: string }> | null;
  view_count: number;
  like_count: number;
  save_count: number;
  share_count: number;
  attributed_orders: number;
  attributed_gmv_fils: string;
  product_taps: number;
  is_shortlisted: boolean;
}

export class DiscoveryService {
  async mine(params: MineParams): Promise<{ items: DiscoveryCard[]; asOf: string }> {
    const sort = MINE_SORT_SQL[params.sort ?? "recent"] ?? MINE_SORT_SQL.recent;
    const limit = Math.min(60, Math.max(1, Math.trunc(Number(params.limit)) || 24));
    const offset = Math.max(0, Math.trunc(Number(params.offset)) || 0);
    const productFilter = params.productId ? "AND own.product_id = $4" : "";

    // $1 vendor_id, $2 limit, $3 offset, ($4 product_id when filtered)
    const sql = `
      SELECT r.id, r.video_playback_url, r.thumbnail_url, r.video_duration_seconds,
             r.language_code, r.caption,
             r.published_at::text AS published_at, r.created_at::text AS created_at,
             u.id AS creator_id,
             COALESCE(NULLIF(TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')), ''), u.email) AS creator_name,
             prod.products AS tagged_products,
             r.view_count, r.like_count, r.save_count, r.share_count,
             COALESCE(att.orders, 0)::int       AS attributed_orders,
             COALESCE(att.gmv_fils, 0)::bigint   AS attributed_gmv_fils,
             COALESCE(taps.total_taps, 0)::int   AS product_taps,
             (sl.id IS NOT NULL)                 AS is_shortlisted
        FROM reels r
        JOIN users u ON u.id = r.user_id
        JOIN LATERAL (
              SELECT json_agg(json_build_object('id', d.id, 'name', d.name)) AS products
                FROM (SELECT DISTINCT p.id, p.name
                        FROM reel_product_tags rpt
                        JOIN products p ON p.id = rpt.product_id
                       WHERE rpt.reel_id = r.id AND p.vendor_id = $1) d
             ) prod ON TRUE
        LEFT JOIN LATERAL (
              SELECT COUNT(DISTINCT rc.order_id)::int AS orders,
                     COALESCE(SUM(rc.item_price_fils), 0)::bigint AS gmv_fils
                FROM reel_commissions rc
               WHERE rc.reel_id = r.id AND rc.vendor_id = $1 AND rc.status <> 'voided'
             ) att ON TRUE
        LEFT JOIN LATERAL (
              SELECT COALESCE(SUM(rpt.tap_count), 0)::int AS total_taps
                FROM reel_product_tags rpt
                JOIN products p ON p.id = rpt.product_id
               WHERE rpt.reel_id = r.id AND p.vendor_id = $1
             ) taps ON TRUE
        LEFT JOIN reel_vendor_shortlists sl
               ON sl.reel_id = r.id AND sl.vendor_id = $1 AND sl.deleted_at IS NULL
       WHERE r.status = 'approved' AND r.deleted_at IS NULL
         AND EXISTS (
              SELECT 1 FROM reel_product_tags own
               JOIN products p ON p.id = own.product_id
              WHERE own.reel_id = r.id AND p.vendor_id = $1 ${productFilter}
            )
       ORDER BY ${sort}
       LIMIT $2 OFFSET $3;
    `;
    const args: unknown[] = params.productId
      ? [params.vendorId, limit, offset, params.productId]
      : [params.vendorId, limit, offset];
    const rows: RawMineRow[] = await AppDataSource.query(sql, args);
    return { items: rows.map((r) => this.toCard(r, true)), asOf: new Date().toISOString() };
  }

  async browse(params: {
    vendorId: string;
    sort?: "ranking" | "recent";
    categoryId?: string | null;
    creatorId?: string | null;
    keyword?: string | null;
    language?: string | null;
    limit?: number;
    offset?: number;
  }): Promise<{ items: DiscoveryCard[]; asOf: string }> {
    const limit = Math.min(60, Math.max(1, Math.trunc(Number(params.limit)) || 24));
    const offset = Math.max(0, Math.trunc(Number(params.offset)) || 0);
    const order =
      params.sort === "recent"
        ? "r.published_at DESC NULLS LAST, r.created_at DESC"
        : "r.ranking_score DESC, r.published_at DESC NULLS LAST";

    const args: unknown[] = [params.vendorId, limit, offset];
    const filters: string[] = [];
    if (params.categoryId) {
      args.push(params.categoryId);
      filters.push(`AND EXISTS (
        SELECT 1 FROM reel_product_tags rpt
          JOIN product_categories pc ON pc.product_id = rpt.product_id
         WHERE rpt.reel_id = r.id AND pc.category_id = $${args.length})`);
    }
    if (params.creatorId) {
      args.push(params.creatorId);
      filters.push(`AND r.user_id = $${args.length}`);
    }
    if (params.keyword) {
      // Escape ILIKE metacharacters so a keyword like "30%" or "SPF_50" is a literal substring.
      const escaped = params.keyword.replace(/[\\%_]/g, (m) => `\\${m}`);
      args.push(`%${escaped}%`);
      filters.push(`AND r.caption ILIKE $${args.length} ESCAPE '\\'`);
    }
    if (params.language) {
      args.push(params.language);
      filters.push(`AND r.language_code = $${args.length}`);
    }

    const sql = `
      SELECT r.id, r.video_playback_url, r.thumbnail_url, r.video_duration_seconds,
             r.language_code, r.caption,
             r.published_at::text AS published_at, r.created_at::text AS created_at,
             u.id AS creator_id,
             COALESCE(NULLIF(TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')), ''), u.email) AS creator_name,
             '[]'::json AS tagged_products,
             r.view_count, r.like_count, r.save_count, r.share_count,
             0::int AS attributed_orders, 0::bigint AS attributed_gmv_fils, 0::int AS product_taps,
             (sl.id IS NOT NULL) AS is_shortlisted
        FROM reels r
        JOIN users u ON u.id = r.user_id
        LEFT JOIN reel_vendor_shortlists sl
               ON sl.reel_id = r.id AND sl.vendor_id = $1 AND sl.deleted_at IS NULL
       WHERE r.status = 'approved' AND r.deleted_at IS NULL
       ${filters.join("\n       ")}
       ORDER BY ${order}
       LIMIT $2 OFFSET $3;
    `;
    const rows: RawMineRow[] = await AppDataSource.query(sql, args);
    // includeAttributed = false → no attributed/product_taps in the response.
    return { items: rows.map((r) => this.toCard(r, false)), asOf: new Date().toISOString() };
  }

  /** Hydrate an explicit, caller-supplied set of reel_ids (the vendor's
   *  shortlist) into full cards WITH the vendor's own attributed metrics and
   *  own tagged products — same projection as mine(), order preserved. */
  async cardsByIds(vendorId: string, reelIds: string[]): Promise<DiscoveryCard[]> {
    if (reelIds.length === 0) return [];
    const sql = `
      SELECT r.id, r.video_playback_url, r.thumbnail_url, r.video_duration_seconds,
             r.language_code, r.caption,
             r.published_at::text AS published_at, r.created_at::text AS created_at,
             u.id AS creator_id,
             COALESCE(NULLIF(TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')), ''), u.email) AS creator_name,
             prod.products AS tagged_products,
             r.view_count, r.like_count, r.save_count, r.share_count,
             COALESCE(att.orders, 0)::int AS attributed_orders,
             COALESCE(att.gmv_fils, 0)::bigint AS attributed_gmv_fils,
             COALESCE(taps.total_taps, 0)::int AS product_taps,
             TRUE AS is_shortlisted
        FROM reels r
        JOIN users u ON u.id = r.user_id
        JOIN LATERAL (
              SELECT json_agg(json_build_object('id', d.id, 'name', d.name)) AS products
                FROM (SELECT DISTINCT p.id, p.name
                        FROM reel_product_tags rpt JOIN products p ON p.id = rpt.product_id
                       WHERE rpt.reel_id = r.id AND p.vendor_id = $1) d
             ) prod ON TRUE
        LEFT JOIN LATERAL (
              SELECT COUNT(DISTINCT rc.order_id)::int AS orders,
                     COALESCE(SUM(rc.item_price_fils), 0)::bigint AS gmv_fils
                FROM reel_commissions rc
               WHERE rc.reel_id = r.id AND rc.vendor_id = $1 AND rc.status <> 'voided'
             ) att ON TRUE
        LEFT JOIN LATERAL (
              SELECT COALESCE(SUM(rpt.tap_count), 0)::int AS total_taps
                FROM reel_product_tags rpt JOIN products p ON p.id = rpt.product_id
               WHERE rpt.reel_id = r.id AND p.vendor_id = $1
             ) taps ON TRUE
       WHERE r.id = ANY($2::uuid[]) AND r.deleted_at IS NULL AND r.status = 'approved';
    `;
    const rows: RawMineRow[] = await AppDataSource.query(sql, [vendorId, reelIds]);
    const byId = new Map(rows.map((r) => [r.id, this.toCard(r, true)]));
    return reelIds.map((id) => byId.get(id)).filter((c): c is DiscoveryCard => Boolean(c));
  }

  private toCard(r: RawMineRow, includeAttributed: boolean): DiscoveryCard {
    const card: DiscoveryCard = {
      id: r.id,
      video_playback_url: r.video_playback_url,
      thumbnail_url: r.thumbnail_url,
      video_duration_seconds: Number(r.video_duration_seconds),
      language_code: r.language_code,
      caption: r.caption,
      published_at: r.published_at,
      created_at: r.created_at,
      creator: { id: r.creator_id, name: r.creator_name },
      tagged_products: r.tagged_products ?? [],
      engagement: {
        views: Number(r.view_count ?? 0),
        likes: Number(r.like_count ?? 0),
        saves: Number(r.save_count ?? 0),
        shares: Number(r.share_count ?? 0),
      },
      is_shortlisted: Boolean(r.is_shortlisted),
    };
    if (includeAttributed) {
      card.attributed = {
        orders: Number(r.attributed_orders ?? 0),
        gmv_fils: Number(r.attributed_gmv_fils ?? 0),
        product_taps: Number(r.product_taps ?? 0),
      };
    }
    return card;
  }
}
