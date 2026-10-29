"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { creatorDisplayName } from "@/lib/creator-display-name";
import { useCreatorDirectory } from "@/lib/queries/creator-content";

// The 7 marketplace categories, byte-identical to apps/web's CATEGORIES in
// src/app/[locale]/account/creator/apply/page.tsx. The two Next.js apps share
// no source, so this duplication is deliberate — if that list changes, change
// it here too.
const CATEGORIES = ["Skincare", "Makeup", "Fragrance", "Hair", "Body", "Wellness", "Tools"];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export default function CreatorsPage() {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [category, setCategory] = useState("");

  // 250ms debounce — a setTimeout in an effect, the same shape the reels
  // product-tag picker uses; this app has no shared useDebounce hook.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(q), 250);
    return () => clearTimeout(timer);
  }, [q]);

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useCreatorDirectory({
    q: debouncedQ,
    category,
  });
  const items = data?.pages.flatMap((page) => page.items) ?? [];
  const isFiltered = debouncedQ !== "" || category !== "";

  return (
    <div className="p-4">
      <h1 className="mb-1 text-xl font-semibold">Creators</h1>
      <p className="mb-4 text-sm text-neutral-500">
        Browse approved creators and invite one to an open collaboration.
      </p>

      <div className="mb-4 flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name or bio…"
          className="w-full max-w-sm rounded border px-2 py-1 text-sm"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded border px-2 py-1 text-sm"
        >
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : items.length === 0 ? (
        // Two distinct empty states: nothing matched the filters, versus no
        // approved creators on the platform at all.
        <p className="text-sm text-neutral-500">
          {isFiltered
            ? "No creators match your search."
            : "No approved creators yet. They'll appear here as applications are approved."}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((card) => (
              // Product-card shape: one big portrait image, then the name. The
              // whole card is the link — bio, intro video and the collab invite
              // all live on the media kit page.
              <Link
                key={card.id}
                href={`/creators/${card.id}`}
                className="block overflow-hidden rounded-lg border border-neutral-200 hover:border-neutral-300"
              >
                <div className="aspect-[3/4] w-full overflow-hidden bg-neutral-100">
                  {card.avatar_url ? (
                    <img src={card.avatar_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-3xl font-medium text-neutral-400">
                      {initials(creatorDisplayName(card.display_name))}
                    </span>
                  )}
                </div>
                <div className="p-3">
                  <p className="truncate text-sm font-medium">
                    {creatorDisplayName(card.display_name)}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-neutral-500">
                    {card.primary_category}
                  </p>
                </div>
              </Link>
            ))}
          </div>

          {hasNextPage && (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="rounded border px-4 py-1.5 text-sm disabled:opacity-50"
              >
                {isFetchingNextPage ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
