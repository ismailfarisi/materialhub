"use client";
import type { Period } from "@/lib/queries/reel-analytics";

const PERIODS: { label: string; value: Period }[] = [
  { label: "7 Days", value: "7d" },
  { label: "30 Days", value: "30d" },
  { label: "90 Days", value: "90d" },
  { label: "All Time", value: "all" },
];

export function ReelAnalyticsHeader({
  period,
  onPeriodChange,
  asOf,
  onRefresh,
  isRefreshing,
  title = "Reel Analytics",
  subtitle = "Performance of reels tagging your products.",
}: {
  period: Period;
  onPeriodChange: (p: Period) => void;
  asOf?: string;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  title?: string;
  subtitle?: string;
}) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
        {asOf && (
          <p className="text-xs text-gray-400 mt-1">
            As of {new Date(asOf).toISOString().slice(0, 16).replace("T", " ")} UTC · today is live,
            earlier days update nightly
          </p>
        )}
      </div>
      <div className="flex items-center gap-1">
        {PERIODS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onPeriodChange(opt.value)}
            className={`px-3 py-1 text-xs rounded-md transition-colors ${
              period === opt.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {opt.label}
          </button>
        ))}
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="ml-2 px-3 py-1 text-xs rounded-md border bg-background hover:bg-muted disabled:opacity-50"
            aria-label="Refresh"
          >
            {isRefreshing ? "Refreshing…" : "↻ Refresh"}
          </button>
        )}
      </div>
    </div>
  );
}
