"use client";

import { useEffect, useState } from "react";
import { MAISON_SANS } from "@/components/checkout/maison-primitives";
import {
  Body,
  BUTTON_CLASS,
  ErrorNote,
  MaisonDialog,
  Quiet,
  SECONDARY_BUTTON_CLASS,
  SMALL_PRIMARY,
  SMALL_SECONDARY,
} from "@/components/creator/maison-ui";
import { deliverBid } from "@/lib/api/creator";
import { type MyReelSummary, getMyReels } from "@/lib/api/reels";

export function DeliverDialog({
  briefId,
  bidId,
  onClose,
  onDelivered,
}: {
  briefId: string;
  bidId: string;
  onClose: () => void;
  onDelivered: () => void;
}) {
  const [reels, setReels] = useState<MyReelSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMyReels()
      .then((res) => setReels(res.items ?? []))
      .catch(() => setReels([]))
      .finally(() => setLoading(false));
  }, []);

  async function confirm() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await deliverBid(briefId, bidId, selected);
      onDelivered();
    } catch (err: unknown) {
      const anyErr = err as { response?: { data?: { error?: string } }; message?: string };
      setError(String(anyErr?.response?.data?.error ?? anyErr?.message ?? "Delivery failed."));
      setBusy(false);
    }
  }

  return (
    <MaisonDialog
      eyebrow="Licensing"
      title="Deliver a reel"
      onClose={onClose}
      closeLabel="Close"
    >
      <Body>Pick one of your reels to deliver for this brief.</Body>

      {loading ? (
        <div className="mt-4">
          <Quiet>Loading your reels…</Quiet>
        </div>
      ) : reels.length === 0 ? (
        <div className="mt-4">
          <Body>
            You have no reels yet. Create one from your reels page, then come back to
            deliver it.
          </Body>
        </div>
      ) : (
        <div className="mt-4 grid max-h-72 grid-cols-3 gap-2 overflow-y-auto">
          {reels.map((r) => (
            <button
              type="button"
              key={r.id}
              onClick={() => setSelected(r.id)}
              className="overflow-hidden transition-colors"
              style={{
                border: `1px solid ${
                  selected === r.id ? "hsl(var(--nl-amber))" : "rgba(44,24,16,0.16)"
                }`,
                background: selected === r.id ? "rgba(184,115,51,0.06)" : "transparent",
              }}
            >
              {r.thumbnail_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={r.thumbnail_url}
                  alt={r.caption ?? "reel"}
                  className="h-28 w-full object-cover"
                />
              ) : (
                <div
                  className="flex h-28 w-full items-center justify-center"
                  style={{
                    background: "rgba(44,24,16,0.07)",
                    fontFamily: MAISON_SANS,
                    fontSize: 11,
                    color: "hsl(var(--nl-russet))",
                  }}
                >
                  {r.id.slice(0, 6)}…
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="mt-3">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          disabled={!selected || busy}
          onClick={confirm}
          className={BUTTON_CLASS}
          style={SMALL_PRIMARY}
        >
          {busy ? "Delivering…" : "Deliver selected"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className={SECONDARY_BUTTON_CLASS}
          style={SMALL_SECONDARY}
        >
          Cancel
        </button>
      </div>
    </MaisonDialog>
  );
}
