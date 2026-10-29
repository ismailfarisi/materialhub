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
  title = "Reel Analytics",
  subtitle,
}: {
  period: Period;
  onPeriodChange: (p: Period) => void;
  asOf?: string;
  title?: string;
  subtitle?: string;
}) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold text-cacao">{title}</h1>
        {subtitle && <p className="text-sm text-taupe">{subtitle}</p>}
        {asOf && (
          <p className="text-xs text-taupe mt-1">
            As of {new Date(asOf).toISOString().slice(0, 16).replace("T", " ")} UTC · today's
            partial numbers update every 5 min
          </p>
        )}
      </div>
      <div className="flex gap-1">
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
      </div>
    </div>
  );
}
