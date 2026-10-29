"use client";

import { useEffect, useRef, useState } from "react";
import {
  addReelTag,
  deleteReelTag,
  fetchTaggableProducts,
  type TaggableProductRow,
} from "@/lib/api/reels";

interface TaggedItem {
  id: string;
  product: { id: string; name: string };
  timestampSeconds: number;
}

interface Props {
  reelId: string;
  videoDurationSeconds: number;
  initialTags: TaggedItem[];
  onChange?: (tags: TaggedItem[]) => void;
}

function formatDeliveredAt(iso: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

function subtitleFor(row: TaggableProductRow): string {
  if (row.source === "vendor_owned") return "Your catalog";
  if (row.source === "permission") return "Tagging access";
  const parts: string[] = [];
  if (row.variant_label) parts.push(row.variant_label);
  if (row.delivered_at) parts.push(`Delivered ${formatDeliveredAt(row.delivered_at)}`);
  return parts.join(" \u00b7 ");
}

export function ProductTagPicker({
  reelId,
  videoDurationSeconds,
  initialTags,
  onChange,
}: Props) {
  const [tags, setTags] = useState<TaggedItem[]>(initialTags);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<TaggableProductRow[]>([]);
  const [timestamp, setTimestamp] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recentLoading, setRecentLoading] = useState(false);
  const [recentError, setRecentError] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const hasFetchedRef = useRef(false);
  const fetchGenRef = useRef(0);
  const recentRef = useRef<TaggableProductRow[] | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function loadRecent() {
    const gen = ++fetchGenRef.current;
    setRecentLoading(true);
    setRecentError(null);
    try {
      const rows = await fetchTaggableProducts("", 10);
      if (gen !== fetchGenRef.current) return;
      recentRef.current = rows;
      setResults(rows);
    } catch {
      if (gen !== fetchGenRef.current) return;
      setRecentError("Couldn't load your products.");
      setResults([]);
    } finally {
      if (gen !== fetchGenRef.current) return;
      setRecentLoading(false);
    }
  }

  function scheduleSearch(q: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const gen = ++fetchGenRef.current;
      if (q.trim() === "") {
        if (recentRef.current) {
          if (gen !== fetchGenRef.current) return;
          setResults(recentRef.current);
        } else {
          await loadRecent();
        }
        return;
      }
      try {
        const rows = await fetchTaggableProducts(q, 20);
        if (gen !== fetchGenRef.current) return;
        setResults(rows);
      } catch {
        if (gen !== fetchGenRef.current) return;
        setResults([]);
      }
    }, 250);
  }

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  async function pick(product: TaggableProductRow) {
    if (tags.length >= 5) {
      setError("Maximum of 5 tags per reel.");
      return;
    }
    if (timestamp > videoDurationSeconds) {
      setError("Timestamp exceeds video duration.");
      return;
    }
    setBusy(true);
    try {
      const tag = await addReelTag(reelId, {
        productId: product.product_id,
        timestampSeconds: timestamp,
      });
      const updated = [
        ...tags,
        {
          id: tag.id,
          product: { id: product.product_id, name: product.name },
          timestampSeconds: timestamp,
        },
      ];
      setTags(updated);
      onChange?.(updated);
      setSearch("");
      setResults([]);
      setDropdownOpen(false);
      setError(null);
    } catch (e: any) {
      setError(e?.response?.data?.error ?? e?.message ?? "Failed to add tag");
    } finally {
      setBusy(false);
    }
  }

  async function remove(tagId: string) {
    setBusy(true);
    try {
      await deleteReelTag(reelId, tagId);
      const updated = tags.filter((t) => t.id !== tagId);
      setTags(updated);
      onChange?.(updated);
    } catch (e: any) {
      setError(e?.response?.data?.error ?? e?.message ?? "Failed to remove tag");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-semibold">
        Tagged products ({tags.length}/5)
      </label>
      <div className="flex gap-2 flex-wrap">
        {tags.map((t) => (
          <span
            key={t.id}
            className="bg-gray-100 rounded-full px-3 py-1 text-sm flex items-center gap-2"
          >
            {t.product.name} @ {t.timestampSeconds}s
            <button
              type="button"
              onClick={() => remove(t.id)}
              className="text-red-600 font-bold"
              aria-label={`Remove ${t.product.name}`}
            >
              &times;
            </button>
          </span>
        ))}
      </div>
      {tags.length < 5 && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              type="number"
              min={0}
              max={videoDurationSeconds}
              step={0.5}
              value={timestamp}
              onChange={(e) => setTimestamp(Number(e.target.value))}
              placeholder="At (seconds)"
              className="border p-1 w-28"
              disabled={busy}
            />
            <input
              type="text"
              value={search}
              onFocus={() => {
                setDropdownOpen(true);
                if (!hasFetchedRef.current) {
                  hasFetchedRef.current = true;
                  loadRecent();
                }
              }}
              onChange={(e) => {
                setSearch(e.target.value);
                scheduleSearch(e.target.value);
              }}
              placeholder="Search your delivered products"
              className="border p-1 flex-1"
              disabled={busy}
            />
          </div>
          {dropdownOpen && (
            <ul
              className="border rounded divide-y"
              role="listbox"
              aria-label="Taggable products"
            >
              {recentLoading && (
                <li className="p-2 text-sm text-gray-500">Loading your products...</li>
              )}

              {!recentLoading && recentError && (
                <li className="p-2 text-sm text-red-600 flex items-center justify-between">
                  <span>{recentError}</span>
                  <button type="button" onClick={loadRecent} className="underline">
                    Retry
                  </button>
                </li>
              )}

              {!recentLoading &&
                !recentError &&
                results.length === 0 &&
                search.trim() === "" && (
                  <li className="p-2 text-sm text-gray-500">
                    No delivered orders yet. Once an order arrives, its products will show up
                    here.
                  </li>
                )}

              {!recentLoading &&
                !recentError &&
                results.length === 0 &&
                search.trim() !== "" && (
                  <li className="p-2 text-sm text-gray-500">
                    No matches for &ldquo;{search}&rdquo;. You can only tag products
                    you&apos;ve received.
                  </li>
                )}

              {results
                .filter((p) => !tags.some((t) => t.product.id === p.product_id))
                .map((p) => (
                <li key={p.product_id} role="option">
                  <button
                    type="button"
                    onClick={() => pick(p)}
                    disabled={busy}
                    className="w-full text-left p-2 hover:bg-gray-50 flex items-center gap-3"
                  >
                    {p.thumbnail_url ? (
                      <img
                        src={p.thumbnail_url}
                        alt={p.name}
                        loading="lazy"
                        className="w-10 h-10 object-cover rounded"
                      />
                    ) : (
                      <div
                        aria-hidden="true"
                        className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center text-gray-400 text-xs"
                      >
                        —
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm truncate" title={p.name}>
                        {p.name}
                      </div>
                      <div className="text-xs text-gray-500 truncate">
                        {subtitleFor(p)}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {error && <div className="text-red-600 text-sm">{error}</div>}
        </div>
      )}
    </div>
  );
}
