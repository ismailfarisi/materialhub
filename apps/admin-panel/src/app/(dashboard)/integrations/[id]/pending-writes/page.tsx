"use client";

import { PendingWritesTable } from "@/components/integrations/PendingWritesTable";
import { usePendingWrites } from "@/lib/queries/integrations";
import { Skeleton, Tabs, TabsList, TabsTrigger } from "@materialhub/ui";
import { useParams } from "next/navigation";
import { useState } from "react";

type StatusTab = "pending" | "approved" | "rejected" | "applied";

export default function PendingWritesPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [tab, setTab] = useState<StatusTab>("pending");

  const { data, isLoading, isError, error } = usePendingWrites(id, tab);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Pending writes</h1>
        <p className="text-sm text-muted-foreground font-mono">{id}</p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as StatusTab)}>
        <TabsList>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
          <TabsTrigger value="applied">Applied</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : isError && (error as { response?: { status?: number } })?.response?.status === 404 ? (
        <div className="space-y-2 py-8 text-center">
          <p className="text-base font-medium">Integration not found</p>
          <p className="text-sm text-muted-foreground">
            There is no sales integration with this id. It may have been removed.
          </p>
        </div>
      ) : isError ? (
        <div className="text-sm text-destructive">
          Couldn&apos;t load pending writes. {error instanceof Error ? error.message : ""}
        </div>
      ) : (
        <PendingWritesTable rows={data ?? []} />
      )}
    </div>
  );
}
