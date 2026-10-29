"use client";
import { type Overview, formatCount } from "@/lib/queries/reel-analytics";
import { Card, CardContent, CardHeader, CardTitle, Skeleton } from "@materialhub/ui";

function Step({
  label,
  value,
  prev,
  color,
}: {
  label: string;
  value: number;
  prev: number;
  color: string;
}) {
  const total = Math.max(prev, value, 1);
  const widthPct = (value / total) * 100;
  const dropPct = prev > 0 ? (value / prev) * 100 : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs text-taupe mb-0.5">
        <span>{label}</span>
        <span>
          {formatCount(value)} {prev > 0 && prev !== value ? `(${dropPct.toFixed(1)}%)` : ""}
        </span>
      </div>
      <div className="h-4 rounded bg-pearl/100">
        <div className="h-4 rounded" style={{ width: `${widthPct}%`, background: color }} />
      </div>
    </div>
  );
}

export function ReelConversionFunnel({
  overview,
  isLoading,
}: {
  overview?: Overview;
  isLoading: boolean;
}) {
  if (isLoading) return <Skeleton className="h-48 rounded-xl" />;
  if (!overview) return null;
  const f = overview.funnel;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">Conversion Funnel</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0 space-y-3">
        <Step label="Impressions" value={f.impressions} prev={f.impressions} color="#3b82f6" />
        <Step label="Product Taps" value={f.taps} prev={f.impressions} color="#f59e0b" />
        <Step label="Attributed Orders" value={f.orders} prev={f.taps} color="#10b981" />
        <Step
          label="Earned Commissions"
          value={f.earnedCommissions}
          prev={f.orders}
          color="#8b5cf6"
        />
      </CardContent>
    </Card>
  );
}
