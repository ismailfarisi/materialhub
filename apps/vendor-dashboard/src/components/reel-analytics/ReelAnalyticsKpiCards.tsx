"use client";
import {
  type VendorOverview,
  formatAED,
  formatCount,
  formatDeltaPct,
} from "@/lib/queries/reel-analytics";
import { Card, CardContent, Skeleton } from "@materialhub/ui";

function DeltaBadge({
  tone,
  text,
}: {
  tone: "up" | "down" | "flat" | "na";
  text: string;
}) {
  const cls =
    tone === "up"
      ? "bg-green-50 text-green-700"
      : tone === "down"
        ? "bg-red-50 text-red-700"
        : tone === "flat"
          ? "bg-gray-100 text-gray-600"
          : "bg-gray-100 text-gray-400";
  return <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-md ${cls}`}>{text}</span>;
}

function K({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta: ReturnType<typeof formatDeltaPct>;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
        <div className="mt-1 text-2xl font-semibold">
          {value}
          <DeltaBadge tone={delta.tone} text={delta.text} />
        </div>
      </CardContent>
    </Card>
  );
}

export function ReelAnalyticsKpiCards({
  overview,
  isLoading,
}: {
  overview?: VendorOverview;
  isLoading: boolean;
}) {
  if (isLoading)
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {["a", "b", "c", "d"].map((k) => (
          <Skeleton key={k} className="h-20 rounded-xl" />
        ))}
      </div>
    );
  if (!overview) return null;
  const { kpis } = overview;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      <K
        label="Impressions"
        value={formatCount(kpis.impressions.value)}
        delta={formatDeltaPct(kpis.impressions.deltaPct)}
      />
      <K
        label="Product Taps"
        value={formatCount(kpis.productTaps.value)}
        delta={formatDeltaPct(kpis.productTaps.deltaPct)}
      />
      <K
        label="Attributed Orders"
        value={formatCount(kpis.attributedOrders.value)}
        delta={formatDeltaPct(kpis.attributedOrders.deltaPct)}
      />
      <K
        label="Attributed GMV"
        value={formatAED(kpis.attributedGmvFils.value)}
        delta={formatDeltaPct(kpis.attributedGmvFils.deltaPct)}
      />
    </div>
  );
}
