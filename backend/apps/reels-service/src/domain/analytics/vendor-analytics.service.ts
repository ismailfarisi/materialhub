import { AppDataSource } from "@materialhub/database";
import { type Period, RollupService, resolvePeriod } from "./rollup.service.ts";

export interface VendorMetricsRow {
  bucket_date: string;
  impressions: number;
  attributed_gmv_fils: number;
  product_taps: number;
  attributed_orders: number;
}

export function buildVendorTimeseries(rows: VendorMetricsRow[]) {
  const m = new Map<string, { date: string; impressions: number; attributedGmvFils: number }>();
  for (const r of rows) {
    const existing = m.get(r.bucket_date) ?? {
      date: r.bucket_date,
      impressions: 0,
      attributedGmvFils: 0,
    };
    existing.impressions += r.impressions;
    existing.attributedGmvFils += r.attributed_gmv_fils;
    m.set(r.bucket_date, existing);
  }
  return [...m.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function pct(c: number, p: number): number | null {
  return p === 0 ? (c === 0 ? 0 : null) : ((c - p) / p) * 100;
}

export class VendorAnalyticsService {
  constructor(private readonly rollup: RollupService = new RollupService()) {}

  async overview(vendorId: string, period: Period, opts: { fresh?: boolean } = {}) {
    const today = new Date();
    const range = resolvePeriod(period, today);
    const prevRange = resolvePeriod(period, today, { previous: true });

    const [currRows, prevRows] = await Promise.all([
      this.fetchVendorRows(vendorId, range.from, range.to, opts),
      this.fetchVendorRows(vendorId, prevRange.from, prevRange.to, opts),
    ]);

    const sum = (rs: VendorMetricsRow[]) =>
      rs.reduce(
        (a, r) => ({
          impressions: a.impressions + r.impressions,
          productTaps: a.productTaps + r.product_taps,
          attributedOrders: a.attributedOrders + r.attributed_orders,
          attributedGmvFils: a.attributedGmvFils + r.attributed_gmv_fils,
        }),
        {
          impressions: 0,
          productTaps: 0,
          attributedOrders: 0,
          attributedGmvFils: 0,
        },
      );
    const curr = sum(currRows);
    const prev = sum(prevRows);

    return {
      kpis: {
        impressions: {
          value: curr.impressions,
          deltaPct: pct(curr.impressions, prev.impressions),
        },
        productTaps: {
          value: curr.productTaps,
          deltaPct: pct(curr.productTaps, prev.productTaps),
        },
        attributedOrders: {
          value: curr.attributedOrders,
          deltaPct: pct(curr.attributedOrders, prev.attributedOrders),
        },
        attributedGmvFils: {
          value: curr.attributedGmvFils,
          deltaPct: pct(curr.attributedGmvFils, prev.attributedGmvFils),
        },
      },
      timeseries: buildVendorTimeseries(currRows),
      asOf: new Date().toISOString(),
    };
  }

  async leaderboard(
    vendorId: string,
    type: "my_products" | "reels_tagging_me" | "creators_promoting_me",
    period: Period,
    limit: number,
  ) {
    // Defense in depth: `limit` is interpolated into SQL below; clamp here even
    // though the route layer also clamps (same pattern as AdminAnalyticsService).
    const safeLimit = Math.min(500, Math.max(1, Math.trunc(Number(limit)) || 20));
    const range = resolvePeriod(period, new Date());
    let sql = "";
    if (type === "my_products") {
      sql = `
        SELECT p.id AS id, p.name AS label,
               COUNT(DISTINCT rc.reel_id)::int                                                     AS reels,
               COUNT(DISTINCT rc.order_id) FILTER (WHERE rc.status <> 'voided')::int               AS orders,
               COALESCE(SUM(rc.item_price_fils) FILTER (WHERE rc.status <> 'voided'), 0)::bigint   AS value
          FROM reel_commissions rc
          JOIN products p ON p.id = rc.product_id
         WHERE rc.vendor_id = $1 AND rc.created_at::date BETWEEN $2 AND $3
         GROUP BY p.id, p.name
         ORDER BY value DESC
         LIMIT ${safeLimit};
      `;
    } else if (type === "reels_tagging_me") {
      // users has email/first_name/last_name (no handle/display_name).
      // reels.user_id (not creator_id) links to users.
      // The CTE merges nightly rollup rows (yesterday and earlier) with today's
      // live aggregates, so a brand-new view shows up in the leaderboard the
      // same day. Order by value desc, then impressions desc so reels with
      // views but no orders still surface above empty rows.
      sql = `
        WITH metrics AS (
          SELECT reel_id, impressions, attributed_orders, attributed_gmv_fils
            FROM daily_reel_metrics
           WHERE bucket_date BETWEEN $2::date AND $3::date
             AND bucket_date < CURRENT_DATE
          UNION ALL
          SELECT reel_id, COUNT(*)::int, 0, 0::bigint
            FROM reel_views
           WHERE viewed_at::date = CURRENT_DATE
             AND CURRENT_DATE BETWEEN $2::date AND $3::date
           GROUP BY reel_id
          UNION ALL
          SELECT reel_id,
                 0,
                 COUNT(DISTINCT order_id) FILTER (WHERE status <> 'voided')::int,
                 COALESCE(SUM(item_price_fils) FILTER (WHERE status <> 'voided'), 0)::bigint
            FROM reel_commissions
           WHERE created_at::date = CURRENT_DATE
             AND CURRENT_DATE BETWEEN $2::date AND $3::date
           GROUP BY reel_id
        )
        SELECT r.id AS id, r.caption AS label, u.email AS sub_label, r.thumbnail_url,
               SUM(m.attributed_orders)::int      AS orders,
               SUM(m.attributed_gmv_fils)::bigint AS value,
               SUM(m.impressions)::int            AS impressions
          FROM metrics m
          JOIN reels r ON r.id = m.reel_id
          JOIN users u ON u.id = r.user_id
         WHERE m.reel_id IN (
             SELECT DISTINCT rpt.reel_id FROM reel_product_tags rpt
              JOIN products p ON p.id = rpt.product_id
              WHERE p.vendor_id = $1
           )
         GROUP BY r.id, r.caption, u.email, r.thumbnail_url
         ORDER BY value DESC, impressions DESC
         LIMIT ${safeLimit};
      `;
    } else {
      sql = `
        SELECT u.id AS id, u.email AS label, (COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) AS sub_label, u.avatar_url,
               COUNT(DISTINCT rc.reel_id)::int                                                     AS reels,
               COUNT(DISTINCT rc.order_id) FILTER (WHERE rc.status <> 'voided')::int               AS orders,
               COALESCE(SUM(rc.item_price_fils) FILTER (WHERE rc.status <> 'voided'), 0)::bigint   AS value
          FROM reel_commissions rc
          JOIN users u ON u.id = rc.creator_id
         WHERE rc.vendor_id = $1 AND rc.created_at::date BETWEEN $2 AND $3
         GROUP BY u.id, u.email, u.first_name, u.last_name, u.avatar_url
         ORDER BY value DESC
         LIMIT ${safeLimit};
      `;
    }
    const rows: Record<string, unknown>[] = await AppDataSource.query(sql, [
      vendorId,
      range.from,
      range.to,
    ]);
    return {
      rows: rows.map((r) => ({
        ...r,
        value: Number(r.value ?? 0),
        orders: r.orders != null ? Number(r.orders) : undefined,
        reels: r.reels != null ? Number(r.reels) : undefined,
        impressions: r.impressions != null ? Number(r.impressions) : undefined,
      })),
      asOf: new Date().toISOString(),
    };
  }

  private async fetchVendorRows(
    vendorId: string,
    from: string,
    to: string,
    opts: { fresh?: boolean } = {},
  ): Promise<VendorMetricsRow[]> {
    const rollupRows: Record<string, unknown>[] = await AppDataSource.query(
      `SELECT bucket_date::text AS bucket_date,
              impressions, product_taps, attributed_orders,
              attributed_gmv_fils::bigint AS attributed_gmv_fils
         FROM daily_vendor_reel_metrics
        WHERE vendor_id = $1 AND bucket_date BETWEEN $2 AND $3`,
      [vendorId, from, to],
    );
    const fromRollup: VendorMetricsRow[] = rollupRows.map((r) => ({
      bucket_date: r.bucket_date as string,
      impressions: Number(r.impressions ?? 0),
      product_taps: Number(r.product_taps ?? 0),
      attributed_orders: Number(r.attributed_orders ?? 0),
      attributed_gmv_fils: Number(r.attributed_gmv_fils ?? 0),
    }));

    const todayStr = new Date().toISOString().slice(0, 10);
    if (to < todayStr) return fromRollup;

    // Today's row isn't in the nightly rollup yet — compute it from raw events,
    // filtered to reels that tag this vendor's products.
    const todayLive = await this.rollup.getTodayReelLive({ bypassCache: opts.fresh });
    if (todayLive.length === 0) return fromRollup;
    const reelIds = await this.vendorReelIds(vendorId);
    if (reelIds.size === 0) return fromRollup;
    const todayAgg = todayLive
      .filter((r) => reelIds.has(r.reel_id))
      .reduce(
        (acc, r) => ({
          impressions: acc.impressions + r.impressions,
          product_taps: acc.product_taps + r.product_taps,
          attributed_orders: acc.attributed_orders + r.attributed_orders,
          attributed_gmv_fils: acc.attributed_gmv_fils + r.attributed_gmv_fils,
        }),
        { impressions: 0, product_taps: 0, attributed_orders: 0, attributed_gmv_fils: 0 },
      );
    if (
      todayAgg.impressions === 0 &&
      todayAgg.product_taps === 0 &&
      todayAgg.attributed_orders === 0 &&
      todayAgg.attributed_gmv_fils === 0
    ) {
      return fromRollup;
    }
    return [...fromRollup, { bucket_date: todayStr, ...todayAgg }];
  }

  private async vendorReelIds(vendorId: string): Promise<Set<string>> {
    const rows: { reel_id: string }[] = await AppDataSource.query(
      `SELECT DISTINCT rpt.reel_id
         FROM reel_product_tags rpt
         JOIN products p ON p.id = rpt.product_id
        WHERE p.vendor_id = $1`,
      [vendorId],
    );
    return new Set(rows.map((r) => r.reel_id));
  }
}
