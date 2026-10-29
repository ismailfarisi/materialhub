import { jwtAuth, requireRole } from "@materialhub/guards";
import { Elysia, t } from "elysia";
import { container } from "../container.ts";
import { leaderboardToCsv } from "../domain/analytics/csv.ts";
import type { Period } from "../domain/analytics/rollup.service.ts";

const PERIODS: Period[] = ["7d", "30d", "90d", "all"];
function parsePeriod(raw: unknown): Period {
  return typeof raw === "string" && (PERIODS as string[]).includes(raw) ? (raw as Period) : "30d";
}

type LeaderboardType =
  | "creators_commission"
  | "creators_gmv"
  | "reels_orders"
  | "products_gmv"
  | "vendors_gmv";
const LB_TYPES: LeaderboardType[] = [
  "creators_commission",
  "creators_gmv",
  "reels_orders",
  "products_gmv",
  "vendors_gmv",
];

export const adminAnalyticsRoutes = new Elysia({ prefix: "/admin/reels/analytics" })
  .use(container)
  .use(jwtAuth)
  .use(requireRole("admin", "super_admin"))
  .get(
    "/overview",
    async ({ query, adminAnalyticsService }: any) => {
      const period = parsePeriod(query.period);
      const vendorId = typeof query.vendor_id === "string" ? query.vendor_id : undefined;
      const data = await adminAnalyticsService.overview(period, { vendorId });
      return { statusCode: 200, data, timestamp: new Date().toISOString() };
    },
    {
      query: t.Object({
        period: t.Optional(t.String()),
        vendor_id: t.Optional(t.String({ format: "uuid" })),
      }),
    },
  )
  .get(
    "/leaderboard",
    async ({ query, adminAnalyticsService }: any) => {
      const type = LB_TYPES.includes(query.type)
        ? (query.type as LeaderboardType)
        : "creators_commission";
      const period = parsePeriod(query.period);
      const vendorId = typeof query.vendor_id === "string" ? query.vendor_id : undefined;
      const limit = Math.min(Number(query.limit ?? 20), 100);
      const { rows, asOf } = await adminAnalyticsService.leaderboard(type, period, limit, {
        vendorId,
      });
      return { statusCode: 200, data: { rows, asOf }, timestamp: new Date().toISOString() };
    },
    {
      query: t.Object({
        type: t.Optional(t.String()),
        period: t.Optional(t.String()),
        vendor_id: t.Optional(t.String({ format: "uuid" })),
        limit: t.Optional(t.Numeric()),
      }),
    },
  )
  .get(
    "/leaderboard.csv",
    async ({ query, adminAnalyticsService, set }: any) => {
      const type = LB_TYPES.includes(query.type)
        ? (query.type as LeaderboardType)
        : "creators_commission";
      const period = parsePeriod(query.period);
      const vendorId = typeof query.vendor_id === "string" ? query.vendor_id : undefined;
      const limit = Math.min(Number(query.limit ?? 100), 500);
      const { rows } = await adminAnalyticsService.leaderboard(type, period, limit, { vendorId });

      const columnsByType: Record<LeaderboardType, string[]> = {
        creators_commission: ["id", "label", "sub_label", "reels", "orders", "gmv_fils", "value"],
        creators_gmv: ["id", "label", "sub_label", "reels", "orders", "value"],
        reels_orders: ["id", "label", "sub_label", "impressions", "value", "gmv_fils"],
        products_gmv: ["id", "label", "sub_label", "reels", "orders", "value"],
        vendors_gmv: ["id", "label", "sub_label", "reels", "orders", "value"],
      };
      const currencyByType: Record<LeaderboardType, Set<string>> = {
        creators_commission: new Set(["value", "gmv_fils"]),
        creators_gmv: new Set(["value"]),
        reels_orders: new Set(["gmv_fils"]),
        products_gmv: new Set(["value"]),
        vendors_gmv: new Set(["value"]),
      };

      const csv = leaderboardToCsv(columnsByType[type], rows, {
        currencyColumns: currencyByType[type],
      });
      set.headers["content-type"] = "text/csv; charset=utf-8";
      set.headers["content-disposition"] =
        `attachment; filename="reel-analytics-${type}-${period}.csv"`;
      return csv;
    },
    {
      query: t.Object({
        type: t.Optional(t.String()),
        period: t.Optional(t.String()),
        vendor_id: t.Optional(t.String({ format: "uuid" })),
        limit: t.Optional(t.Numeric()),
      }),
    },
  );
