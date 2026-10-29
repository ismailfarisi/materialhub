// apps/vendor-dashboard/src/lib/queries/reel-analytics.ts
import { useQuery } from "@tanstack/react-query";
import { api } from "../api";

export type Period = "7d" | "30d" | "90d" | "all";
export type LeaderboardType = "my_products" | "reels_tagging_me" | "creators_promoting_me";

export interface VendorOverview {
  kpis: {
    impressions: { value: number; deltaPct: number | null };
    productTaps: { value: number; deltaPct: number | null };
    attributedOrders: { value: number; deltaPct: number | null };
    attributedGmvFils: { value: number; deltaPct: number | null };
  };
  timeseries: Array<{
    date: string;
    impressions: number;
    attributedGmvFils: number;
  }>;
  asOf: string;
}

export function useVendorReelOverview(period: Period) {
  return useQuery({
    queryKey: ["vendor-reel-analytics", "overview", period],
    queryFn: async () => {
      const { data } = await api.get<{ data: VendorOverview }>("/vendor/reels/analytics/overview", {
        params: { period },
      });
      return data.data;
    },
    staleTime: 60_000,
  });
}

// One-shot fetch that bypasses the server's today-cache. Used by the Refresh
// button to surface the very latest impressions even within the cache window.
export async function fetchVendorReelOverviewFresh(period: Period): Promise<VendorOverview> {
  const { data } = await api.get<{ data: VendorOverview }>("/vendor/reels/analytics/overview", {
    params: { period, fresh: "1" },
  });
  return data.data;
}

export interface VendorLeaderboardRow {
  id: string;
  label: string;
  sub_label?: string;
  thumbnail_url?: string;
  avatar_url?: string;
  value: number;
  orders?: number;
  reels?: number;
  impressions?: number;
}

export function useVendorReelLeaderboard(type: LeaderboardType, period: Period, limit = 20) {
  return useQuery({
    queryKey: ["vendor-reel-analytics", "leaderboard", type, period, limit],
    queryFn: async () => {
      const { data } = await api.get<{
        data: { rows: VendorLeaderboardRow[]; asOf: string };
      }>("/vendor/reels/analytics/leaderboard", {
        params: { type, period, limit },
      });
      return data.data;
    },
    staleTime: 60_000,
  });
}

export function vendorLeaderboardCsvUrl(type: LeaderboardType, period: Period): string {
  const params = new URLSearchParams({ type, period });
  return `/vendor/reels/analytics/leaderboard.csv?${params.toString()}`;
}

export function formatAED(fils: number | null | undefined): string {
  if (fils == null) return "—";
  return `AED ${(fils / 100).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatCount(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("en-AE");
}

export function formatDeltaPct(d: number | null): {
  text: string;
  tone: "up" | "down" | "flat" | "na";
} {
  if (d == null) return { text: "—", tone: "na" };
  if (d === 0) return { text: "0%", tone: "flat" };
  return {
    text: `${d > 0 ? "+" : ""}${d.toFixed(1)}%`,
    tone: d > 0 ? "up" : "down",
  };
}
