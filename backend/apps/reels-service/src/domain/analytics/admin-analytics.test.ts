import { describe, expect, it } from "bun:test";
import { computeDeltas, rollUpOverview } from "./admin-analytics.service.ts";
import type { ReelMetricsRow } from "./rollup.service.ts";

function row(over: Partial<ReelMetricsRow> = {}): ReelMetricsRow {
  return {
    reel_id: over.reel_id ?? "r",
    bucket_date: over.bucket_date ?? "2026-04-19",
    impressions: 0,
    unique_viewers: 0,
    likes: 0,
    saves: 0,
    shares: 0,
    product_taps: 0,
    attributed_orders: 0,
    attributed_gmv_fils: 0,
    earned_commission_fils: 0,
    ...over,
  };
}

describe("rollUpOverview", () => {
  it("sums counts and currencies across rows", () => {
    const rows = [
      row({
        impressions: 100,
        product_taps: 10,
        attributed_orders: 2,
        attributed_gmv_fils: 5000,
        earned_commission_fils: 500,
        likes: 5,
        saves: 2,
        shares: 1,
      }),
      row({
        impressions: 50,
        product_taps: 5,
        attributed_orders: 1,
        attributed_gmv_fils: 2000,
        earned_commission_fils: 200,
        likes: 1,
        saves: 1,
        shares: 0,
      }),
    ];
    const o = rollUpOverview(rows);
    expect(o.impressions).toBe(150);
    expect(o.productTapRate).toBeCloseTo(0.1, 4);
    expect(o.engagementRate).toBeCloseTo((5 + 2 + 1 + 1 + 1 + 0) / 150, 4);
    expect(o.attributedOrders).toBe(3);
    expect(o.attributedGmvFils).toBe(7000);
    expect(o.earnedCommissionFils).toBe(700);
  });

  it("returns zeros (no NaN) when no rows", () => {
    const o = rollUpOverview([]);
    expect(o.impressions).toBe(0);
    expect(o.engagementRate).toBe(0);
    expect(o.productTapRate).toBe(0);
  });
});

describe("computeDeltas", () => {
  it("returns percent delta on counts", () => {
    const d = computeDeltas(
      {
        impressions: 120,
        unique_viewers: 0,
        attributedOrders: 10,
        attributedGmvFils: 5000,
        earnedCommissionFils: 500,
        engagementRate: 0.08,
        productTapRate: 0.04,
      },
      {
        impressions: 100,
        unique_viewers: 0,
        attributedOrders: 5,
        attributedGmvFils: 4000,
        earnedCommissionFils: 300,
        engagementRate: 0.05,
        productTapRate: 0.03,
      },
    );
    expect(d.impressions.deltaPct).toBeCloseTo(20);
    expect(d.attributedOrders.deltaPct).toBeCloseTo(100);
    expect(d.engagementRate.deltaPp).toBeCloseTo(3);
  });

  it("prev=0 and curr>0 → deltaPct = null (undefined growth)", () => {
    const d = computeDeltas(
      {
        impressions: 100,
        unique_viewers: 0,
        attributedOrders: 10,
        attributedGmvFils: 5000,
        earnedCommissionFils: 500,
        engagementRate: 0.08,
        productTapRate: 0.04,
      },
      {
        impressions: 0,
        unique_viewers: 0,
        attributedOrders: 0,
        attributedGmvFils: 0,
        earnedCommissionFils: 0,
        engagementRate: 0,
        productTapRate: 0,
      },
    );
    expect(d.impressions.deltaPct).toBeNull();
  });
});
