"use client";

import { useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { StatCard, Skeleton, Card, CardContent, CardHeader, CardTitle } from "@materialhub/ui";
import { TrendingUp, Store, Users, ShoppingCart } from "lucide-react";
import { usePlatformStats, usePlatformRevenue } from "@/lib/queries/dashboard";

const PERIOD_OPTIONS = [
  { label: "7 Days", value: "7d" },
  { label: "30 Days", value: "30d" },
  { label: "90 Days", value: "90d" },
];

const ORDER_STATUS_COLORS: Record<string, string> = {
  pending: "#f59e0b",
  confirmed: "#3b82f6",
  processing: "#8b5cf6",
  shipped: "#06b6d4",
  delivered: "#10b981",
  cancelled: "#ef4444",
  returned: "#f97316",
};

function formatCurrency(fils: number) {
  return `AED ${(fils / 100).toLocaleString("en-AE", { minimumFractionDigits: 2 })}`;
}

export default function AdminDashboardPage() {
  const [period, setPeriod] = useState("7d");
  const { data: stats, isLoading: statsLoading } = usePlatformStats();
  const { data: revenueData, isLoading: revenueLoading } = usePlatformRevenue(period);

  // Build order status breakdown data for pie chart.
  // The API returns an array of { status, count } objects.
  const orderStatusData = Array.isArray(stats?.order_status_breakdown)
    ? (stats.order_status_breakdown as Array<{ status: string; count: number }>).map(
        ({ status, count }) => ({ name: status, value: count })
      )
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-cacao mb-1">Platform Dashboard</h1>
        <p className="text-taupe text-sm">Platform-wide overview and key metrics.</p>
      </div>

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
              title="GMV (Total)"
              value={stats?.gmv != null ? formatCurrency(stats.gmv) : "—"}
              icon={<TrendingUp size={20} />}
              trend={stats?.gmv_change}
            />
            <StatCard
              title="Active Vendors"
              value={stats?.active_vendors != null ? stats.active_vendors.toLocaleString() : "—"}
              icon={<Store size={20} />}
              trend={stats?.active_vendors_change}
            />
            <StatCard
              title="New Users (30d)"
              value={stats?.new_users_30d != null ? stats.new_users_30d.toLocaleString() : "—"}
              icon={<Users size={20} />}
              trend={stats?.new_users_30d_change}
            />
            <StatCard
              title="Total Orders"
              value={stats?.total_orders != null ? stats.total_orders.toLocaleString() : "—"}
              icon={<ShoppingCart size={20} />}
              trend={stats?.total_orders_change}
            />
          </>
        )}
      </div>

      {/* Revenue Chart */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base font-semibold">Platform Revenue Over Time</CardTitle>
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
              <AreaChart
                data={revenueData ?? []}
                margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="date"
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
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  fill="url(#revenueGradient)"
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Order Status Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pie Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Order Status Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-56 w-full rounded-lg" />
            ) : orderStatusData.length > 0 ? (
              <ResponsiveContainer width="100%" height={224}>
                <PieChart>
                  <Pie
                    data={orderStatusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {orderStatusData.map((entry) => (
                      <Cell
                        key={entry.name}
                        fill={ORDER_STATUS_COLORS[entry.name] ?? "#94a3b8"}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number, name: string) => [value.toLocaleString(), name]}
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: 12 }}
                    formatter={(value) => value.charAt(0).toUpperCase() + value.slice(1)}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-10">No data available.</p>
            )}
          </CardContent>
        </Card>

        {/* Status summary stat cards */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Orders by Status</CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full rounded-lg" />
                ))}
              </div>
            ) : orderStatusData.length > 0 ? (
              <div className="space-y-2">
                {orderStatusData.map((entry) => {
                  const total = orderStatusData.reduce((acc, e) => acc + e.value, 0);
                  const pct = total > 0 ? ((entry.value / total) * 100).toFixed(1) : "0.0";
                  return (
                    <div key={entry.name} className="flex items-center gap-3">
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: ORDER_STATUS_COLORS[entry.name] ?? "#94a3b8" }}
                      />
                      <span className="text-sm capitalize flex-1 text-foreground">
                        {entry.name}
                      </span>
                      <span className="text-sm font-medium tabular-nums">
                        {entry.value.toLocaleString()}
                      </span>
                      <span className="text-xs text-muted-foreground w-12 text-right tabular-nums">
                        {pct}%
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-10">No data available.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
