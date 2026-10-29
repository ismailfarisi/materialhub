"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@materialhub/ui";
import { useCollectionPreview, type CollectionSort } from "@/lib/queries/collections";

const SORTS: { label: string; value: CollectionSort }[] = [
  { label: "Custom", value: "custom" },
  { label: "Price ↑", value: "price_asc" },
  { label: "Price ↓", value: "price_desc" },
  { label: "Newest", value: "newest" },
  { label: "Rating", value: "rating" },
];

export function CollectionPreview({ collectionId }: { collectionId: string }) {
  const [sort, setSort] = useState<CollectionSort>("custom");
  const [page, setPage] = useState(1);
  const perPage = 12;
  const { data, isLoading, isFetching } = useCollectionPreview(collectionId, {
    sort,
    page,
    perPage,
  });

  return (
    <Card className="sticky top-4">
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle className="text-sm font-semibold text-cacao uppercase tracking-wide">
          Preview
        </CardTitle>
        <select
          value={sort}
          onChange={(e) => {
            setSort(e.target.value as CollectionSort);
            setPage(1);
          }}
          className="rounded-md border border-gray-300 bg-background px-2 py-1 text-xs"
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </CardHeader>
      <CardContent>
        <div className="mb-2 text-xs text-muted-foreground">
          {isLoading ? "Loading…" : `${data?.total ?? 0} product(s)`}
          {isFetching && !isLoading ? " · refreshing…" : ""}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {(data?.items ?? []).map((p: any) => (
            <div key={p.id} className="rounded-md border p-2 text-xs">
              {p.images?.[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.images[0]} alt="" className="mb-1 aspect-square w-full rounded object-cover" />
              ) : (
                <div className="mb-1 aspect-square w-full rounded bg-muted" />
              )}
              <div className="truncate font-medium">{p.name}</div>
              <div className="text-muted-foreground">AED {((p.price_min ?? 0) / 100).toFixed(2)}</div>
            </div>
          ))}
        </div>
        {data && (data.hasMore || page > 1) && (
          <div className="mt-3 flex items-center justify-between text-xs">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded border px-2 py-1 disabled:opacity-40"
            >
              Prev
            </button>
            <span className="text-muted-foreground">Page {page}</span>
            <button
              type="button"
              disabled={!data.hasMore}
              onClick={() => setPage((p) => p + 1)}
              className="rounded border px-2 py-1 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
