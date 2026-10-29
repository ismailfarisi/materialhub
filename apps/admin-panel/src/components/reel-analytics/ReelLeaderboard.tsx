"use client";
import { useState } from "react";
import { Card, CardContent, CardHeader, Skeleton } from "@materialhub/ui";
import {
  adminLeaderboardCsvUrl, formatAED, formatCount,
  useAdminReelLeaderboard,
  type LeaderboardRow, type LeaderboardType, type Period,
} from "@/lib/queries/reel-analytics";

const TABS: { key: LeaderboardType; label: string }[] = [
  { key: "creators_commission", label: "Top Creators · Commission" },
  { key: "creators_gmv",        label: "By GMV" },
  { key: "reels_orders",        label: "Reels · Orders" },
  { key: "products_gmv",        label: "Products · Revenue" },
  { key: "vendors_gmv",         label: "Vendors · Revenue" },
];

function ValueCell({ type, row }: { type: LeaderboardType; row: LeaderboardRow }) {
  // value meaning per type:
  //   creators_commission: earned_commission_fils
  //   creators_gmv:        attributed_gmv_fils
  //   reels_orders:        attributed_orders (count)
  //   products_gmv:        attributed_gmv_fils
  //   vendors_gmv:         attributed_gmv_fils
  return <td className="text-right font-medium">
    {type === "reels_orders" ? formatCount(row.value) : formatAED(row.value)}
  </td>;
}

export function ReelLeaderboard({ period, vendorId }: { period: Period; vendorId?: string }) {
  const [tab, setTab] = useState<LeaderboardType>("creators_commission");
  const { data, isLoading } = useAdminReelLeaderboard(tab, period, vendorId);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex flex-wrap gap-1">
          {TABS.map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`px-2.5 py-1 text-xs rounded-md ${tab === t.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
            >{t.label}</button>
          ))}
        </div>
        <a
          href={adminLeaderboardCsvUrl(tab, period, vendorId)}
          className="text-xs px-2.5 py-1 rounded-md border hover:bg-muted"
          download
        >⇩ CSV</a>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        {isLoading ? (
          <Skeleton className="h-64 rounded-xl" />
        ) : (
          <>
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wide text-taupe">
                <tr>
                  <th className="text-left py-2 w-8">#</th>
                  <th className="text-left py-2">Name</th>
                  <th className="text-right py-2">Reels</th>
                  <th className="text-right py-2">Orders</th>
                  <th className="text-right py-2">Value</th>
                </tr>
              </thead>
              <tbody>
                {(data?.rows ?? []).map((row, i) => (
                  <tr key={row.id} className="border-t">
                    <td className="py-2 text-taupe">{i + 1}</td>
                    <td className="py-2">
                      <div className="font-medium">{row.label}</div>
                      {row.sub_label && <div className="text-xs text-taupe">{row.sub_label}</div>}
                    </td>
                    <td className="text-right">{formatCount(row.reels)}</td>
                    <td className="text-right">{formatCount(row.orders)}</td>
                    <ValueCell type={tab} row={row} />
                  </tr>
                ))}
                {data?.rows?.length === 0 && (
                  <tr><td colSpan={5} className="py-6 text-center text-sm text-taupe">No data in this period.</td></tr>
                )}
              </tbody>
            </table>
            {data?.rows && data.rows.length > 0 && (
              <p className="text-xs text-taupe pt-3">
                Total: {data.rows.length} {data.rows.length === 1 ? "entry" : "entries"}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
