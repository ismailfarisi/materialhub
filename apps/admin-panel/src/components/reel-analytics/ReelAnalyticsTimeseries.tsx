"use client";
import type { Overview } from "@/lib/queries/reel-analytics";
import { Card, CardContent, CardHeader, CardTitle, Skeleton } from "@materialhub/ui";
import { useState } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type MetricKey = "impressions_gmv" | "engagementRate" | "productTapRate" | "earnedCommissionFils";

const METRICS: { key: MetricKey; label: string }[] = [
  { key: "impressions_gmv", label: "Impressions + GMV" },
  { key: "engagementRate", label: "Engagement rate" },
  { key: "productTapRate", label: "Product-tap rate" },
  { key: "earnedCommissionFils", label: "Commission paid" },
];

export function ReelAnalyticsTimeseries({
  overview,
  isLoading,
}: {
  overview?: Overview;
  isLoading: boolean;
}) {
  const [metric, setMetric] = useState<MetricKey>("impressions_gmv");

  if (isLoading) return <Skeleton className="h-72 rounded-xl" />;
  if (!overview || overview.timeseries.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-taupe">
          No reel activity in this period.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base font-semibold">Trends</CardTitle>
        <select
          className="text-xs border rounded-md px-2 py-1"
          value={metric}
          onChange={(e) => setMetric(e.target.value as MetricKey)}
        >
          {METRICS.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
      </CardHeader>
      <CardContent className="p-4 pt-0 h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={overview.timeseries}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" fontSize={11} />
            <YAxis yAxisId="L" fontSize={11} />
            <YAxis yAxisId="R" orientation="right" fontSize={11} />
            <Tooltip />
            <Legend />
            {metric === "impressions_gmv" && (
              <>
                <Line
                  yAxisId="L"
                  type="monotone"
                  dataKey="impressions"
                  stroke="#3b82f6"
                  dot={false}
                  name="Impressions"
                />
                <Line
                  yAxisId="R"
                  type="monotone"
                  dataKey="attributedGmvFils"
                  stroke="#10b981"
                  dot={false}
                  name="Attributed GMV (fils)"
                />
              </>
            )}
            {metric === "engagementRate" && (
              <Line
                yAxisId="L"
                type="monotone"
                dataKey="engagementRate"
                stroke="#8b5cf6"
                dot={false}
              />
            )}
            {metric === "productTapRate" && (
              <Line
                yAxisId="L"
                type="monotone"
                dataKey="productTapRate"
                stroke="#f59e0b"
                dot={false}
              />
            )}
            {metric === "earnedCommissionFils" && (
              <Line
                yAxisId="L"
                type="monotone"
                dataKey="earnedCommissionFils"
                stroke="#ef4444"
                dot={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
