"use client";

import { useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { StatCard, Skeleton, Card, CardContent, CardHeader, CardTitle } from "@materialhub/ui";
import { TrendUp, ShoppingCart, Eye, Percent, Warning } from "@phosphor-icons/react";
import { useVendorStats, useRevenueChart, useVendorWarehouses } from "@/lib/queries/dashboard";

const PERIOD_OPTIONS = [
  { label: "7 Days", value: "7d" },
  { label: "30 Days", value: "30d" },
  { label: "90 Days", value: "90d" },
];

function WarehouseSetupBanner() {
  const { data: warehouses, isSuccess } = useVendorWarehouses();
  // Only warn on a definitive answer — a fetch error must not cry wolf.
  if (!isSuccess) return null;
  const hasUsableWarehouse = (warehouses ?? []).some((w) => w.is_active && w.is_default);
  if (hasUsableWarehouse) return null;
  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
      <Warning size={20} weight="fill" className="text-amber-500 flex-shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-semibold text-amber-900">No pickup warehouse configured</p>
        <p className="text-sm text-amber-800">
          Orders cannot ship until a default warehouse with your pickup address is set up. Please
          contact MaterialHub support to add one.
        </p>
      </div>
    </div>
  );
}

/**
 * Chart dates arrive as ISO strings ("2026-11-07T00:00:00.000Z" or
 * "2026-11-07"); show "7 Nov". A calendar date is read as UTC so it never
 * slips a day in the viewer's time zone.
 */
function formatChartDate(value: unknown, withYear = false) {
  if (typeof value !== "string" && !(value instanceof Date)) return String(value ?? "");
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("en-AE", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

function formatCurrency(fils: number) {
  return `AED ${(fils / 100).toLocaleString("en-AE", { minimumFractionDigits: 2 })}`;
}

export default function DashboardPage() {
  const [period, setPeriod] = useState("7d");
  const { data: stats, isLoading: statsLoading } = useVendorStats();
  const { data: revenueData, isLoading: revenueLoading } = useRevenueChart(period);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Dashboard</h1>
        <p className="text-gray-500 text-sm">Welcome back! Here&apos;s how your store is performing.</p>
      </div>

      <WarehouseSetupBanner />

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {statsLoading ? (
          <>
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </>
        ) : (
          <>
            <StatCard
              title="Revenue Today"
              value={stats?.revenue_today != null ? formatCurrency(stats.revenue_today) : "—"}
              icon={<TrendUp size={20} />}
              trend={stats?.revenue_today_change}
            />
            <StatCard
              title="Orders Today"
              value={stats?.orders_today ?? "—"}
              icon={<ShoppingCart size={20} />}
              trend={stats?.orders_today_change}
            />
            <StatCard
              title="Page Views"
              value={stats?.page_views != null ? stats.page_views.toLocaleString() : "—"}
              icon={<Eye size={20} />}
              trend={stats?.page_views_change}
            />
            <StatCard
              title="Conversion Rate"
              value={stats?.conversion_rate != null ? `${stats.conversion_rate.toFixed(2)}%` : "—"}
              icon={<Percent size={20} />}
              trend={stats?.conversion_rate_change}
            />
          </>
        )}
      </div>

      {/* Revenue Chart */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base font-semibold">Revenue Over Time</CardTitle>
          <div className="flex gap-1">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setPeriod(opt.value)}
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
        </CardHeader>
        <CardContent>
          {revenueLoading ? (
            <Skeleton className="h-64 w-full rounded-lg" />
          ) : (
            <ResponsiveContainer width="100%" height={264}>
              <LineChart
                data={revenueData ?? []}
                margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v) => formatChartDate(v)}
                  minTickGap={16}
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tickFormatter={(v) => `AED ${(v / 100).toLocaleString("en-AE")}`}
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  width={80}
                />
                <Tooltip
                  formatter={(value: number) => [formatCurrency(value), "Revenue"]}
                  labelFormatter={(label) => formatChartDate(label, true)}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
