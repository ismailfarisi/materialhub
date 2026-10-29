import { AppDataSource } from "@materialhub/database";

export type Period = "7d" | "30d" | "90d" | "all";

export interface PeriodRange {
  from: string; // YYYY-MM-DD inclusive
  to: string; // YYYY-MM-DD inclusive
}

const PERIOD_DAYS: Record<Exclude<Period, "all">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Resolve a period against a "today" anchor. `previous: true` returns the same-length window ending one day before `from`. */
export function resolvePeriod(
  period: Period,
  today: Date,
  opts: { previous?: boolean } = {},
): PeriodRange {
  if (period === "all") {
    return { from: "2000-01-01", to: toDateStr(today) };
  }
  const days = PERIOD_DAYS[period];
  const toDate = new Date(today);
  const fromDate = new Date(today);
  fromDate.setUTCDate(fromDate.getUTCDate() - (days - 1));
  if (opts.previous) {
    const prevTo = new Date(fromDate);
    prevTo.setUTCDate(prevTo.getUTCDate() - 1);
    const prevFrom = new Date(prevTo);
    prevFrom.setUTCDate(prevFrom.getUTCDate() - (days - 1));
    return { from: toDateStr(prevFrom), to: toDateStr(prevTo) };
  }
  return { from: toDateStr(fromDate), to: toDateStr(toDate) };
}

/** Raw row from daily_reel_metrics UNION "today-live". Currency fields return as number (fils). */
export interface ReelMetricsRow {
  reel_id: string;
  bucket_date: string;
  impressions: number;
  unique_viewers: number;
  likes: number;
  saves: number;
  shares: number;
  product_taps: number;
  attributed_orders: number;
  attributed_gmv_fils: number;
  earned_commission_fils: number;
}

const TODAY_TTL_MS = 5 * 60 * 1000;
const todayCache = new Map<string, { rows: ReelMetricsRow[]; expiresAt: number }>();

export class RollupService {
  /** Pre-aggregated rows for completed days (strictly yesterday and earlier). */
  async getReelRollup(range: PeriodRange): Promise<ReelMetricsRow[]> {
    const today = toDateStr(new Date());
    const rows: unknown[] = await AppDataSource.query(
      `SELECT reel_id, bucket_date::text AS bucket_date,
              impressions, unique_viewers, likes, saves, shares, product_taps,
              attributed_orders,
              attributed_gmv_fils::bigint AS attributed_gmv_fils,
              earned_commission_fils::bigint AS earned_commission_fils
         FROM daily_reel_metrics
        WHERE bucket_date >= $1 AND bucket_date <= $2 AND bucket_date < $3`,
      [range.from, range.to, today],
    );
    return rows.map(this.reshapeReelRow);
  }

  /**
   * Live-computed "today" rows. Shape identical to rollup rows. Result is cached
   * in-process for TODAY_TTL_MS (5 min) to prevent repeated aggregation hits on
   * raw event tables. In-memory for v1 — swap for Redis once `feedCache` gets a
   * real backing client (see container.ts `feedCacheRedisStub`).
   */
  async getTodayReelLive(opts: { bypassCache?: boolean } = {}): Promise<ReelMetricsRow[]> {
    const todayStr = toDateStr(new Date());
    if (!opts.bypassCache) {
      const cached = todayCache.get(todayStr);
      if (cached && cached.expiresAt > Date.now()) return cached.rows;
    }
    const rows: unknown[] = await AppDataSource.query(buildTodayReelSql(), [todayStr]);
    const reshaped = rows.map(this.reshapeReelRow);
    todayCache.set(todayStr, { rows: reshaped, expiresAt: Date.now() + TODAY_TTL_MS });
    for (const [k, v] of todayCache) if (v.expiresAt < Date.now()) todayCache.delete(k);
    return reshaped;
  }

  private reshapeReelRow = (r: unknown): ReelMetricsRow => {
    const row = r as Record<string, unknown>;
    return {
      reel_id: row.reel_id as string,
      bucket_date: row.bucket_date as string,
      impressions: Number(row.impressions ?? 0),
      unique_viewers: Number(row.unique_viewers ?? 0),
      likes: Number(row.likes ?? 0),
      saves: Number(row.saves ?? 0),
      shares: Number(row.shares ?? 0),
      product_taps: Number(row.product_taps ?? 0),
      attributed_orders: Number(row.attributed_orders ?? 0),
      attributed_gmv_fils: Number(row.attributed_gmv_fils ?? 0),
      earned_commission_fils: Number(row.earned_commission_fils ?? 0),
    };
  };
}

/**
 * Same-shape aggregation over raw event tables, filtered to `today`.
 * Single SQL that the caller runs with a `today` param ('YYYY-MM-DD').
 * Excludes voided commissions from attributed_orders + attributed_gmv_fils.
 */
export function buildTodayReelSql(): string {
  return `
    WITH v AS (
      SELECT reel_id,
             COUNT(*)::int                          AS impressions,
             COUNT(DISTINCT COALESCE(user_id::text, session_id::text))::int AS unique_viewers
        FROM reel_views
       WHERE viewed_at::date = $1::date
       GROUP BY reel_id
    ), l AS (
      SELECT reel_id, COUNT(*)::int AS likes FROM reel_likes WHERE liked_at::date = $1::date GROUP BY reel_id
    ), s AS (
      SELECT reel_id, COUNT(*)::int AS saves FROM reel_saves WHERE saved_at::date = $1::date GROUP BY reel_id
    ), t AS (
      SELECT reel_id, COUNT(*)::int AS product_taps
        FROM reel_attributions
       WHERE tapped_at::date = $1::date
       GROUP BY reel_id
    ), c AS (
      SELECT reel_id,
             COUNT(DISTINCT order_id)           FILTER (WHERE status <> 'voided')::int AS attributed_orders,
             COALESCE(SUM(item_price_fils)       FILTER (WHERE status <> 'voided'), 0)::bigint AS attributed_gmv_fils,
             COALESCE(SUM(gross_commission_fils) FILTER (WHERE status IN ('earned','paid_out')), 0)::bigint AS earned_commission_fils
        FROM reel_commissions
       WHERE created_at::date = $1::date
       GROUP BY reel_id
    )
    SELECT COALESCE(v.reel_id, l.reel_id, s.reel_id, t.reel_id, c.reel_id) AS reel_id,
           $1::date AS bucket_date,
           COALESCE(v.impressions, 0)             AS impressions,
           COALESCE(v.unique_viewers, 0)          AS unique_viewers,
           COALESCE(l.likes, 0)                   AS likes,
           COALESCE(s.saves, 0)                   AS saves,
           0                                      AS shares,
           COALESCE(t.product_taps, 0)            AS product_taps,
           COALESCE(c.attributed_orders, 0)       AS attributed_orders,
           COALESCE(c.attributed_gmv_fils, 0)     AS attributed_gmv_fils,
           COALESCE(c.earned_commission_fils, 0)  AS earned_commission_fils
      FROM v
      FULL JOIN l  USING (reel_id)
      FULL JOIN s  USING (reel_id)
      FULL JOIN t  USING (reel_id)
      FULL JOIN c  USING (reel_id)
  `;
}
