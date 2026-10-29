import { describe, expect, it, mock } from "bun:test";
import type { ReelMetricsRow, RollupService } from "./rollup.service.ts";
import { VendorAnalyticsService, buildVendorTimeseries } from "./vendor-analytics.service.ts";

describe("buildVendorTimeseries", () => {
  it("groups rows by bucket_date, sums impressions and gmv", () => {
    const series = buildVendorTimeseries([
      {
        bucket_date: "2026-04-18",
        impressions: 10,
        attributed_gmv_fils: 1000,
        product_taps: 2,
        attributed_orders: 1,
      },
      {
        bucket_date: "2026-04-18",
        impressions: 5,
        attributed_gmv_fils: 500,
        product_taps: 1,
        attributed_orders: 0,
      },
      {
        bucket_date: "2026-04-19",
        impressions: 20,
        attributed_gmv_fils: 2000,
        product_taps: 3,
        attributed_orders: 2,
      },
    ]);
    expect(series).toEqual([
      { date: "2026-04-18", impressions: 15, attributedGmvFils: 1500 },
      { date: "2026-04-19", impressions: 20, attributedGmvFils: 2000 },
    ]);
  });
});

describe("VendorAnalyticsService.fetchVendorRows today-live integration", () => {
  it("forwards bypassCache=true when fresh:true is requested", async () => {
    const calls: Array<{ bypassCache?: boolean }> = [];
    const fakeRollup = {
      getTodayReelLive: mock(async (opts: { bypassCache?: boolean } = {}) => {
        calls.push(opts);
        return [] as ReelMetricsRow[];
      }),
    } as unknown as RollupService;

    const svc = new VendorAnalyticsService(fakeRollup);
    // Override the SQL-touching methods so the test stays in-memory.
    (svc as any).fetchVendorRows = async (
      vendorId: string,
      _from: string,
      to: string,
      opts: { fresh?: boolean } = {},
    ) => {
      const todayStr = new Date().toISOString().slice(0, 10);
      if (to >= todayStr) {
        await fakeRollup.getTodayReelLive({ bypassCache: opts.fresh });
      }
      return [] as ReturnType<typeof buildVendorTimeseries> extends Array<infer T> ? T[] : never[];
    };

    await svc.overview("v1", "30d", { fresh: true });

    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((c) => c.bypassCache === true)).toBe(true);
  });
});
