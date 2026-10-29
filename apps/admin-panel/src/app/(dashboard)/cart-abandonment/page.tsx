"use client";

import { useCartAbandonmentStats } from "@/lib/queries/cart-abandonment";
import { ShoppingCart, TrendingDown, TrendingUp, DollarSign } from "lucide-react";

function StatCard({
  title,
  value,
  icon: Icon,
  color,
  suffix,
}: {
  title: string;
  value: string | number;
  icon: any;
  color: string;
  suffix?: string;
}) {
  return (
    <div className="border rounded-lg p-6">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-muted-foreground">{title}</span>
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="text-2xl font-bold">
        {value}{suffix}
      </p>
    </div>
  );
}

export default function CartAbandonmentPage() {
  const { data: stats, isLoading } = useCartAbandonmentStats();

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Cart Abandonment</h1>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="border rounded-lg p-6 h-[108px] animate-pulse bg-muted/30" />
          ))}
        </div>
      ) : stats ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatCard
              title="Total Abandoned"
              value={stats.total_abandoned}
              icon={ShoppingCart}
              color="bg-red-100 text-red-600"
            />
            <StatCard
              title="Recovered"
              value={stats.total_recovered}
              icon={TrendingUp}
              color="bg-green-100 text-green-600"
            />
            <StatCard
              title="Abandonment Rate"
              value={stats.abandonment_rate}
              icon={TrendingDown}
              color="bg-orange-100 text-orange-600"
              suffix="%"
            />
            <StatCard
              title="Revenue Recovered"
              value={`${(stats.revenue_recovered / 100).toLocaleString()} AED`}
              icon={DollarSign}
              color="bg-blue-100 text-amber"
            />
          </div>

          <div className="border rounded-lg p-6">
            <h2 className="font-semibold mb-2">Recovery Rate</h2>
            <div className="flex items-center gap-4">
              <div className="flex-1 bg-muted rounded-full h-4 overflow-hidden">
                <div
                  className="bg-green-500 h-full rounded-full transition-all"
                  style={{ width: `${stats.recovery_rate}%` }}
                />
              </div>
              <span className="text-sm font-bold">{stats.recovery_rate}%</span>
            </div>
          </div>
        </>
      ) : (
        <p className="text-muted-foreground">Failed to load stats</p>
      )}
    </div>
  );
}
