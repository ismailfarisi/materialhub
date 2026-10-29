"use client";

import { useState } from "react";
import { approveReel, rejectReel, flagReel } from "@/lib/api/reels-admin";

interface Props {
  reel: any;
  onClose: () => void;
  onActionComplete: () => void;
}

export function ReelReviewModal({ reel, onClose, onActionComplete }: Props) {
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(action: "approve" | "reject" | "flag") {
    setError(null);
    if (action === "reject" && !reason.trim()) {
      setError("A reason is required to reject a reel.");
      return;
    }
    setBusy(true);
    try {
      if (action === "approve") await approveReel(reel.id, notes || undefined);
      if (action === "reject") await rejectReel(reel.id, reason, notes || undefined);
      if (action === "flag") await flagReel(reel.id, notes || undefined);
      onActionComplete();
    } catch (e: any) {
      setError(e?.response?.data?.error ?? e?.message ?? "Action failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-linen rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-4">
          <h2 className="text-xl font-bold">Review Reel</h2>
          <button onClick={onClose} className="text-2xl" aria-label="Close">
            &times;
          </button>
        </div>
        <video
          src={reel.video_playback_url}
          controls
          playsInline
          className="w-full max-h-[50vh] bg-black"
        />
        <div className="my-2 text-sm">
          <strong>Caption:</strong> {reel.caption || <em className="text-taupe">none</em>}
        </div>
        <div className="my-2 text-sm">
          <strong>Language:</strong> {reel.language_code}
        </div>
        <div className="my-2 text-sm">
          <strong>Tags:</strong>{" "}
          {(reel.tags ?? [])
            .map((t: any) => t.product?.name ?? t.product_id)
            .join(", ") || <em className="text-taupe">none</em>}
        </div>
        <div className="my-2 text-sm">
          <strong>Sponsored disclosed:</strong>{" "}
          {reel.is_sponsored_disclosed ? "Yes" : "No"}
        </div>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Rejection reason (required to reject)"
          className="border w-full p-2 mt-2 text-sm"
          rows={2}
        />
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Internal notes (optional)"
          className="border w-full p-2 mt-2 text-sm"
          rows={2}
        />
        {error && <div className="text-red-600 text-sm mt-2">{error}</div>}
        <div className="flex gap-2 mt-4">
          <button
            onClick={() => act("approve")}
            disabled={busy}
            className="bg-green-600 text-white px-4 py-2 rounded disabled:opacity-50"
          >
            Approve
          </button>
          <button
            onClick={() => act("reject")}
            disabled={busy}
            className="bg-red-600 text-white px-4 py-2 rounded disabled:opacity-50"
          >
            Reject
          </button>
          <button
            onClick={() => act("flag")}
            disabled={busy}
            className="bg-yellow-600 text-white px-4 py-2 rounded disabled:opacity-50"
          >
            Flag
          </button>
        </div>
      </div>
    </div>
  );
}
