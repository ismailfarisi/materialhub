import { config } from "@materialhub/config";
import { AppDataSource } from "@materialhub/database";
import { type Job, Queue, Worker } from "bullmq";

const QUEUE_NAME = "reels-scheduled";
const JOB_NAME = "recomputeDailyRollups";
const RECOMPUTE_WINDOW_DAYS = 14;

export function datesToRecompute(today: Date, windowDays: number): string[] {
  const out: string[] = [];
  for (let i = 1; i <= windowDays; i++) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export class RecomputeDailyRollupsJob {
  private worker: Worker | null = null;
  private readonly queue: Queue;

  constructor() {
    this.queue = new Queue(QUEUE_NAME, { connection: { url: config.bullmq.redisUrl } });
  }

  start(): void {
    void this.queue.add(
      JOB_NAME,
      {},
      {
        repeat: { pattern: "15 2 * * *", tz: "UTC" },
        removeOnComplete: 5,
        removeOnFail: 50,
      },
    );
    this.worker = new Worker(
      QUEUE_NAME,
      async (job: Job) => {
        if (job.name !== JOB_NAME) return;
        await this.runOnce(new Date());
      },
      { connection: { url: config.bullmq.redisUrl } },
    );
  }

  /** Public so tests + the bootstrap backfill script can invoke directly. */
  async runOnce(today: Date): Promise<{ processed: number; failed: string[] }> {
    const dates = datesToRecompute(today, RECOMPUTE_WINDOW_DAYS);
    const failed: string[] = [];
    for (const d of dates) {
      try {
        await this.recomputeOneDay(d);
      } catch (err) {
        failed.push(d);
        console.error("[reels.analytics.rollup.failed]", {
          bucket_date: d,
          error: (err as Error).message,
        });
      }
    }
    return { processed: dates.length - failed.length, failed };
  }

  private async recomputeOneDay(bucketDate: string): Promise<void> {
    console.log("[reels.analytics.rollup.start]", { bucket_date: bucketDate });
    const start = Date.now();

    await AppDataSource.transaction(async (m) => {
      await m.query("DELETE FROM daily_reel_metrics        WHERE bucket_date = $1", [bucketDate]);
      await m.query("DELETE FROM daily_creator_metrics     WHERE bucket_date = $1", [bucketDate]);
      await m.query("DELETE FROM daily_vendor_reel_metrics WHERE bucket_date = $1", [bucketDate]);

      // 1) daily_reel_metrics — FULL JOIN CTE across event tables for this bucket_date.
      // Shares column: always 0 (no reel_shares event table in v1; tracked as running counter elsewhere).
      // Commission semantics: attributed_* = non-voided; earned_commission_fils = earned + paid_out.
      await m.query(
        `
        WITH v AS (
          SELECT reel_id, COUNT(*)::int AS impressions, COUNT(DISTINCT COALESCE(user_id::text, session_id::text))::int AS unique_viewers
            FROM reel_views WHERE viewed_at::date = $1::date GROUP BY reel_id
        ), l AS (
          SELECT reel_id, COUNT(*)::int AS likes FROM reel_likes  WHERE liked_at::date  = $1::date GROUP BY reel_id
        ), s AS (
          SELECT reel_id, COUNT(*)::int AS saves FROM reel_saves  WHERE saved_at::date  = $1::date GROUP BY reel_id
        ), t AS (
          SELECT reel_id, COUNT(*)::int AS product_taps
            FROM reel_attributions WHERE tapped_at::date = $1::date GROUP BY reel_id
        ), c AS (
          SELECT reel_id,
                 COUNT(DISTINCT order_id)           FILTER (WHERE status <> 'voided')::int AS attributed_orders,
                 COALESCE(SUM(item_price_fils)       FILTER (WHERE status <> 'voided'), 0)::bigint AS attributed_gmv_fils,
                 COALESCE(SUM(gross_commission_fils) FILTER (WHERE status IN ('earned','paid_out')), 0)::bigint AS earned_commission_fils
            FROM reel_commissions WHERE created_at::date = $1::date GROUP BY reel_id
        )
        INSERT INTO daily_reel_metrics
          (reel_id, bucket_date, impressions, unique_viewers, likes, saves, shares,
           product_taps, attributed_orders, attributed_gmv_fils, earned_commission_fils)
        SELECT COALESCE(v.reel_id, l.reel_id, s.reel_id, t.reel_id, c.reel_id) AS reel_id,
               $1::date,
               COALESCE(v.impressions, 0), COALESCE(v.unique_viewers, 0),
               COALESCE(l.likes, 0), COALESCE(s.saves, 0), 0 /* shares: no event table; always 0 for v1 */,
               COALESCE(t.product_taps, 0),
               COALESCE(c.attributed_orders, 0), COALESCE(c.attributed_gmv_fils, 0), COALESCE(c.earned_commission_fils, 0)
          FROM v
          FULL JOIN l  USING (reel_id)
          FULL JOIN s  USING (reel_id)
          FULL JOIN t  USING (reel_id)
          FULL JOIN c  USING (reel_id);
      `,
        [bucketDate],
      );

      // 2) daily_creator_metrics — aggregate reel rows up by reels.user_id (creator of the reel).
      await m.query(
        `
        INSERT INTO daily_creator_metrics
          (creator_id, bucket_date, reel_count, impressions, unique_viewers, engagement_events,
           attributed_orders, attributed_gmv_fils, earned_commission_fils)
        SELECT r.user_id, $1::date,
               COUNT(DISTINCT drm.reel_id)::int,
               COALESCE(SUM(drm.impressions), 0)::int,
               COALESCE(SUM(drm.unique_viewers), 0)::int,
               COALESCE(SUM(drm.likes + drm.saves + drm.shares), 0)::int,
               COALESCE(SUM(drm.attributed_orders), 0)::int,
               COALESCE(SUM(drm.attributed_gmv_fils), 0)::bigint,
               COALESCE(SUM(drm.earned_commission_fils), 0)::bigint
          FROM daily_reel_metrics drm
          JOIN reels r ON r.id = drm.reel_id
         WHERE drm.bucket_date = $1::date
         GROUP BY r.user_id;
      `,
        [bucketDate],
      );

      // 3) daily_vendor_reel_metrics — aggregate metrics per vendor.
      // A reel tagging multiple products of the same vendor is ONE (vendor, reel) pair — we
      // de-dup via `vendor_reels` CTE before joining to metrics, otherwise SUM(impressions)
      // etc. double-count across duplicate tag rows.
      // NOTE: A reel tagging products of multiple vendors is counted once per vendor, so sum
      // across vendors may exceed platform total. Intentional v1 "reel reach" semantic.
      await m.query(
        `
        WITH vendor_reels AS (
          SELECT DISTINCT p.vendor_id, rpt.reel_id
            FROM reel_product_tags rpt
            JOIN products p ON p.id = rpt.product_id
        ), vendor_taps AS (
          SELECT p2.vendor_id, COUNT(*)::int AS product_taps
            FROM reel_attributions ra
            JOIN products p2 ON p2.id = ra.product_id
           WHERE ra.tapped_at::date = $1::date
           GROUP BY p2.vendor_id
        ), vendor_commissions AS (
          SELECT rc.vendor_id,
                 COUNT(DISTINCT rc.order_id) FILTER (WHERE rc.status <> 'voided')::int         AS attributed_orders,
                 COALESCE(SUM(rc.item_price_fils) FILTER (WHERE rc.status <> 'voided'), 0)::bigint AS attributed_gmv_fils
            FROM reel_commissions rc
           WHERE rc.created_at::date = $1::date
           GROUP BY rc.vendor_id
        )
        INSERT INTO daily_vendor_reel_metrics
          (vendor_id, bucket_date, reel_count, impressions, product_taps, attributed_orders, attributed_gmv_fils)
        SELECT vr.vendor_id, $1::date,
               COUNT(DISTINCT vr.reel_id)::int,
               COALESCE(SUM(drm.impressions), 0)::int,
               COALESCE(MAX(vt.product_taps), 0)::int,
               COALESCE(MAX(vc.attributed_orders), 0)::int,
               COALESCE(MAX(vc.attributed_gmv_fils), 0)::bigint
          FROM vendor_reels vr
          JOIN daily_reel_metrics drm ON drm.reel_id = vr.reel_id
          LEFT JOIN vendor_taps vt        ON vt.vendor_id = vr.vendor_id
          LEFT JOIN vendor_commissions vc ON vc.vendor_id = vr.vendor_id
         WHERE drm.bucket_date = $1::date
         GROUP BY vr.vendor_id;
      `,
        [bucketDate],
      );
    });

    console.log("[reels.analytics.rollup.complete]", {
      bucket_date: bucketDate,
      duration_ms: Date.now() - start,
    });
  }

  async stop(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
    await this.queue.close();
  }
}
