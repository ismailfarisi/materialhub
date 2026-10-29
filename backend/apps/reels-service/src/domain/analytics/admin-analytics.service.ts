import { AppDataSource } from "@materialhub/database";
import {
  type Period,
  type PeriodRange,
  type ReelMetricsRow,
  RollupService,
  resolvePeriod,
} from "./rollup.service.ts";

export interface Overview {
  impressions: number;
  unique_viewers: number;
  engagementRate: number;
  productTapRate: number;
  attributedOrders: number;
  attributedGmvFils: number;
  earnedCommissionFils: number;
}

export interface DeltaCount {
  value: number;
  deltaPct: number | null;
}
export interface DeltaRate {
  value: number;
  deltaPp: number | null;
}
export interface OverviewWithDeltas {
  kpis: {
    impressions: DeltaCount;
    engagementRate: DeltaRate;
    productTapRate: DeltaRate;
    attributedOrders: DeltaCount;
    attributedGmvFils: DeltaCount;
    earnedCommissionFils: DeltaCount;
  };
  timeseries: Array<{
    date: string;
    impressions: number;
    attributedGmvFils: number;
    attributedOrders: number;
    earnedCommissionFils: number;
    engagementRate: number;
    productTapRate: number;
  }>;
  funnel: {
    impressions: number;
    taps: number;
    orders: number;
    earnedCommissions: number;
  };
  asOf: string;
}

export function rollUpOverview(rows: ReelMetricsRow[]): Overview {
  const sum = rows.reduce(
    (acc, r) => ({
      impressions: acc.impressions + r.impressions,
      unique_viewers: acc.unique_viewers + r.unique_viewers,
      engagement_events: acc.engagement_events + r.likes + r.saves + r.shares, // shares always 0 in v1
      product_taps: acc.product_taps + r.product_taps,
      attributedOrders: acc.attributedOrders + r.attributed_orders,
      attributedGmvFils: acc.attributedGmvFils + r.attributed_gmv_fils,
      earnedCommissionFils: acc.earnedCommissionFils + r.earned_commission_fils,
    }),
    {
      impressions: 0,
      unique_viewers: 0,
      engagement_events: 0,
      product_taps: 0,
      attributedOrders: 0,
      attributedGmvFils: 0,
      earnedCommissionFils: 0,
    },
  );
  return {
    impressions: sum.impressions,
    unique_viewers: sum.unique_viewers,
    engagementRate: sum.impressions > 0 ? sum.engagement_events / sum.impressions : 0,
    productTapRate: sum.impressions > 0 ? sum.product_taps / sum.impressions : 0,
    attributedOrders: sum.attributedOrders,
    attributedGmvFils: sum.attributedGmvFils,
    earnedCommissionFils: sum.earnedCommissionFils,
  };
}

export function computeDeltas(curr: Overview, prev: Overview): OverviewWithDeltas["kpis"] {
  const pct = (c: number, p: number): number | null =>
    p === 0 ? (c === 0 ? 0 : null) : ((c - p) / p) * 100;
  const pp = (c: number, p: number): number => (c - p) * 100;
  return {
    impressions: {
      value: curr.impressions,
      deltaPct: pct(curr.impressions, prev.impressions),
    },
    attributedOrders: {
      value: curr.attributedOrders,
      deltaPct: pct(curr.attributedOrders, prev.attributedOrders),
    },
    attributedGmvFils: {
      value: curr.attributedGmvFils,
      deltaPct: pct(curr.attributedGmvFils, prev.attributedGmvFils),
    },
    earnedCommissionFils: {
      value: curr.earnedCommissionFils,
      deltaPct: pct(curr.earnedCommissionFils, prev.earnedCommissionFils),
    },
    engagementRate: {
      value: curr.engagementRate,
      deltaPp: pp(curr.engagementRate, prev.engagementRate),
    },
    productTapRate: {
      value: curr.productTapRate,
      deltaPp: pp(curr.productTapRate, prev.productTapRate),
    },
  };
}

export class AdminAnalyticsService {
  constructor(private readonly rollup: RollupService = new RollupService()) {}

  async overview(period: Period, opts: { vendorId?: string } = {}): Promise<OverviewWithDeltas> {
    const today = new Date();
    const curr = await this.fetchRowsForPeriod(resolvePeriod(period, today), opts);
    const prev = await this.fetchRowsForPeriod(
      resolvePeriod(period, today, { previous: true }),
      opts,
    );

    const currAgg = rollUpOverview(curr);
    const prevAgg = rollUpOverview(prev);

    const timeseriesMap = new Map<
      string,
      {
        date: string;
        impressions: number;
        attributedGmvFils: number;
        attributedOrders: number;
        earnedCommissionFils: number;
        _taps: number;
        _eng: number;
      }
    >();
    for (const r of curr) {
      const bucket = timeseriesMap.get(r.bucket_date) ?? {
        date: r.bucket_date,
        impressions: 0,
        attributedGmvFils: 0,
        attributedOrders: 0,
        earnedCommissionFils: 0,
        _taps: 0,
        _eng: 0,
      };
      bucket.impressions += r.impressions;
      bucket.attributedGmvFils += r.attributed_gmv_fils;
      bucket.attributedOrders += r.attributed_orders;
      bucket.earnedCommissionFils += r.earned_commission_fils;
      bucket._taps += r.product_taps;
      bucket._eng += r.likes + r.saves + r.shares;
      timeseriesMap.set(r.bucket_date, bucket);
    }
    const timeseries = [...timeseriesMap.values()]
      .map((b) => ({
        date: b.date,
        impressions: b.impressions,
        attributedGmvFils: b.attributedGmvFils,
        attributedOrders: b.attributedOrders,
        earnedCommissionFils: b.earnedCommissionFils,
        engagementRate: b.impressions > 0 ? b._eng / b.impressions : 0,
        productTapRate: b.impressions > 0 ? b._taps / b.impressions : 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      kpis: computeDeltas(currAgg, prevAgg),
      timeseries,
      funnel: {
        impressions: currAgg.impressions,
        taps: curr.reduce((a, r) => a + r.product_taps, 0),
        orders: currAgg.attributedOrders,
        // Distinct reels with any earned commission in the period. Counting reel-day rows
        // instead would scale with period length and break the funnel's monotonic read.
        earnedCommissions: new Set(
          curr.filter((r) => r.earned_commission_fils > 0).map((r) => r.reel_id),
        ).size,
      },
      asOf: new Date().toISOString(),
    };
  }

  private async fetchRowsForPeriod(
    range: PeriodRange,
    opts: { vendorId?: string },
  ): Promise<ReelMetricsRow[]> {
    const rollupRows = await this.rollup.getReelRollup(range);
    const todayStr = new Date().toISOString().slice(0, 10);
    const includeToday = range.to >= todayStr;
    const todayRows = includeToday ? await this.rollup.getTodayReelLive() : [];

    let all = [...rollupRows, ...todayRows];
    if (opts.vendorId) {
      const reelIds = await vendorReelIds(opts.vendorId);
      all = all.filter((r) => reelIds.has(r.reel_id));
    }
    return all;
  }

  async leaderboard(
    type: "creators_commission" | "creators_gmv" | "reels_orders" | "products_gmv" | "vendors_gmv",
    period: Period,
    limit: number,
    opts: { vendorId?: string } = {},
  ): Promise<{ rows: Record<string, unknown>[]; asOf: string }> {
    // Defense in depth: `limit` is interpolated into SQL below; clamp here even though the
    // route layer also clamps. Any non-finite or negative value falls back to 20.
    const safeLimit = Math.min(500, Math.max(1, Math.trunc(Number(limit)) || 20));
    const range = resolvePeriod(period, new Date());
    const params: unknown[] = [range.from, range.to];
    // Reels don't have a direct `vendor_id`. Filter reels through reel_product_tags → products.vendor_id.
    // Vendor filter only applies to reels_orders and products_gmv. On creators_* and vendors_gmv, the UI
    // should disable the filter dropdown.
    const reelVendorClause = opts.vendorId
      ? ` AND EXISTS (SELECT 1 FROM reel_product_tags rpt
                      JOIN products p2 ON p2.id = rpt.product_id
                      WHERE rpt.reel_id = drm.reel_id AND p2.vendor_id = $3) `
      : " ";
    if (opts.vendorId) params.push(opts.vendorId);

    let sql = "";
    if (type === "creators_commission") {
      // users has first_name/last_name/email/avatar_url (no handle/display_name columns).
      sql = `
        SELECT dcm.creator_id AS id,
               u.email AS label,
               (COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) AS sub_label,
               u.avatar_url,
               SUM(dcm.earned_commission_fils)::bigint AS value,
               SUM(dcm.attributed_orders)::int         AS orders,
               SUM(dcm.attributed_gmv_fils)::bigint    AS gmv_fils,
               SUM(dcm.reel_count)::int                AS reels
          FROM daily_creator_metrics dcm
          JOIN users u ON u.id = dcm.creator_id
         WHERE dcm.bucket_date BETWEEN $1 AND $2
         GROUP BY dcm.creator_id, u.email, u.first_name, u.last_name, u.avatar_url
         ORDER BY SUM(dcm.earned_commission_fils) DESC
         LIMIT ${safeLimit};
      `;
    } else if (type === "creators_gmv") {
      sql = `
        SELECT dcm.creator_id AS id,
               u.email AS label,
               (COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) AS sub_label,
               u.avatar_url,
               SUM(dcm.attributed_gmv_fils)::bigint AS value,
               SUM(dcm.attributed_orders)::int      AS orders,
               SUM(dcm.reel_count)::int             AS reels
          FROM daily_creator_metrics dcm
          JOIN users u ON u.id = dcm.creator_id
         WHERE dcm.bucket_date BETWEEN $1 AND $2
         GROUP BY dcm.creator_id, u.email, u.first_name, u.last_name, u.avatar_url
         ORDER BY SUM(dcm.attributed_gmv_fils) DESC
         LIMIT ${safeLimit};
      `;
    } else if (type === "reels_orders") {
      // reels.user_id (not creator_id) links to users.
      sql = `
        SELECT drm.reel_id AS id,
               r.caption   AS label,
               u.email     AS sub_label,
               r.thumbnail_url,
               SUM(drm.attributed_orders)::int     AS value,
               SUM(drm.attributed_gmv_fils)::bigint AS gmv_fils,
               SUM(drm.impressions)::int           AS impressions
          FROM daily_reel_metrics drm
          JOIN reels r ON r.id = drm.reel_id
          JOIN users u ON u.id = r.user_id
         WHERE drm.bucket_date BETWEEN $1 AND $2 ${reelVendorClause}
         GROUP BY drm.reel_id, r.caption, u.email, r.thumbnail_url
         ORDER BY SUM(drm.attributed_orders) DESC
         LIMIT ${safeLimit};
      `;
    } else if (type === "products_gmv") {
      // products has no thumbnail_url column; pull the primary product_images row.
      sql = `
        SELECT p.id AS id,
               p.name AS label,
               v.business_name AS sub_label,
               (SELECT pi.thumbnail_url
                  FROM product_images pi
                 WHERE pi.product_id = p.id AND pi.deleted_at IS NULL
                 ORDER BY pi.is_primary DESC, pi.sort_order ASC
                 LIMIT 1) AS thumbnail_url,
               COALESCE(SUM(rc.item_price_fils) FILTER (WHERE rc.status <> 'voided'), 0)::bigint AS value,
               (COUNT(DISTINCT rc.order_id) FILTER (WHERE rc.status <> 'voided'))::int           AS orders,
               COUNT(DISTINCT rc.reel_id)::int                                                    AS reels
          FROM reel_commissions rc
          JOIN products p ON p.id = rc.product_id
          JOIN vendors v  ON v.id = rc.vendor_id
         WHERE rc.created_at::date BETWEEN $1 AND $2 ${opts.vendorId ? " AND rc.vendor_id = $3 " : " "}
         GROUP BY p.id, p.name, v.business_name
         ORDER BY SUM(rc.item_price_fils) FILTER (WHERE rc.status <> 'voided') DESC NULLS LAST
         LIMIT ${safeLimit};
      `;
    } else if (type === "vendors_gmv") {
      sql = `
        SELECT dvrm.vendor_id AS id,
               v.business_name AS label,
               v.slug AS sub_label,
               v.logo_url AS avatar_url,
               SUM(dvrm.attributed_gmv_fils)::bigint AS value,
               SUM(dvrm.attributed_orders)::int      AS orders,
               SUM(dvrm.reel_count)::int             AS reels
          FROM daily_vendor_reel_metrics dvrm
          JOIN vendors v ON v.id = dvrm.vendor_id
         WHERE dvrm.bucket_date BETWEEN $1 AND $2
         GROUP BY dvrm.vendor_id, v.business_name, v.slug, v.logo_url
         ORDER BY SUM(dvrm.attributed_gmv_fils) DESC
         LIMIT ${safeLimit};
      `;
    }
    const rows: Record<string, unknown>[] = await AppDataSource.query(sql, params);
    return {
      rows: rows.map((r) => ({
        ...r,
        value: Number(r.value ?? 0),
        gmv_fils: r.gmv_fils != null ? Number(r.gmv_fils) : undefined,
        orders: r.orders != null ? Number(r.orders) : undefined,
        reels: r.reels != null ? Number(r.reels) : undefined,
        impressions: r.impressions != null ? Number(r.impressions) : undefined,
      })),
      asOf: new Date().toISOString(),
    };
  }
}

async function vendorReelIds(vendorId: string): Promise<Set<string>> {
  const rows: { reel_id: string }[] = await AppDataSource.query(
    `SELECT DISTINCT rpt.reel_id
       FROM reel_product_tags rpt
       JOIN products p ON p.id = rpt.product_id
      WHERE p.vendor_id = $1`,
    [vendorId],
  );
  return new Set(rows.map((r) => r.reel_id));
}
