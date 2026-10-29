"use client";

import { useEffect, useState } from "react";
import { listModerationQueue } from "@/lib/api/reels-admin";
import { ReelReviewModal } from "./reel-review-modal";

export function ModerationQueue() {
  const [items, setItems] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await listModerationQueue({});
      setItems(data.items);
    } catch (e: any) {
      setError(e?.response?.data?.error ?? e?.message ?? "Failed to load queue");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Reels — Moderation Queue</h1>
      {loading && <div>Loading...</div>}
      {error && <div className="text-red-600 mb-2">{error}</div>}
      {!loading && items.length === 0 && (
        <div className="text-taupe">No reels pending review.</div>
      )}
      {items.length > 0 && (
        <table className="w-full" data-stack="md">
          <thead>
            <tr className="border-b text-left">
              <th className="p-2">Thumbnail</th>
              <th className="p-2">User</th>
              <th className="p-2">Language</th>
              <th className="p-2">Tags</th>
              <th className="p-2">Submitted</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id} className="border-b">
                <td className="p-2" data-label="Thumbnail">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={r.thumbnail_url}
                    alt=""
                    className="w-16 h-28 object-cover"
                  />
                </td>
                <td className="p-2 font-mono text-xs" data-label="User">{r.user_id}</td>
                <td className="p-2" data-label="Language">{r.language_code}</td>
                <td className="p-2" data-label="Tags">{r.tags?.length ?? 0}</td>
                <td className="p-2 text-sm" data-label="Submitted">
                  {new Date(r.created_at).toLocaleString()}
                </td>
                <td className="p-2">
                  <button
                    onClick={() => setSelected(r)}
                    className="underline text-amber"
                  >
                    Review
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {items.length > 0 && (
        <p className="text-xs text-taupe pt-2">
          Total: {items.length} pending reel{items.length === 1 ? "" : "s"}
        </p>
      )}
      {selected && (
        <ReelReviewModal
          reel={selected}
          onClose={() => setSelected(null)}
          onActionComplete={() => {
            setSelected(null);
            load();
          }}
        />
      )}
    </div>
  );
}
