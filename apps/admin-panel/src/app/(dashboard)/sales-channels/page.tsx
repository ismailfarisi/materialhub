"use client";

import { ChannelCard } from "@/components/sales-channels/ChannelCard";
import { useSalesChannels } from "@/lib/queries/sales-channels";

export default function SalesChannelsPage() {
  const { data, isLoading, isError, error } = useSalesChannels();

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Sales Channels</h1>
        <p className="text-sm text-muted-foreground">
          Live status across Google Merchant, Meta Catalog, and TikTok. Card metrics auto-refresh
          every 30 seconds.
        </p>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading channels…</p>}
      {isError && (
        <p className="text-sm text-destructive">
          Failed to load channels: {(error as Error)?.message ?? "unknown error"}
        </p>
      )}

      <div className="grid gap-4">
        {data?.map((channel) => <ChannelCard key={channel.code} channel={channel} />)}
      </div>
    </div>
  );
}
