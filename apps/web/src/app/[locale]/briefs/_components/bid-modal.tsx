"use client";

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { useAuthStore } from "@/stores/auth";
import { getCreatorOpenBriefs, placeBid } from "@/lib/api/creator";
import type { PublicBrief } from "./brief-board";

export function BidModal({ brief, onClose }: { brief: PublicBrief; onClose: () => void }) {
  const locale = useLocale();
  const user = useAuthStore((s) => s.user);
  const isCreator = user?.creator_tier === "creator" || user?.creator_tier === "influencer";

  const [body, setBody] = useState<string | null>(null);
  const [amountAed, setAmountAed] = useState("");
  const [pitch, setPitch] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    if (!isCreator) return;
    getCreatorOpenBriefs()
      .then((list) => setBody(list.find((b) => b.id === brief.id)?.brief ?? null))
      .catch(() => setBody(null));
  }, [isCreator, brief.id]);

  async function submit() {
    if (busy || msg?.kind === "ok") return;
    const aedVal = Number.parseFloat(amountAed);
    if (Number.isNaN(aedVal) || aedVal < 50) {
      setMsg({ kind: "err", text: "Bid must be at least AED 50." });
      return;
    }
    if (!pitch.trim()) {
      setMsg({ kind: "err", text: "Add a short pitch." });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await placeBid(brief.id, Math.round(aedVal * 100), pitch.trim());
      setMsg({ kind: "ok", text: "Bid placed — track it under My Bids." });
    } catch (err: unknown) {
      const anyErr = err as { response?: { data?: { error?: string } }; message?: string };
      setMsg({ kind: "err", text: String(anyErr?.response?.data?.error ?? anyErr?.message ?? "Could not place bid.") });
    } finally {
      setBusy(false);
    }
  }

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop click-to-close; inner panel stops propagation
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: backdrop click-to-close; inner panel stops propagation */}
      <div
        className="w-full max-w-md rounded-xl bg-background p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-xs text-muted-foreground">{brief.vendor_name ?? "Brand"}</div>
        <h2 className="mt-0.5 text-lg font-semibold">{brief.title}</h2>

        {!isCreator ? (
          <div className="mt-4 text-sm text-muted-foreground">
            You need a creator account to bid.{" "}
            <a href={`/${locale}/auth/login?returnTo=/${locale}/briefs`} className="text-primary underline">
              Sign in
            </a>{" "}
            or apply to become a creator from your account.
          </div>
        ) : (
          <>
            {body && <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{body}</p>}
            <div className="mt-4 flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Your bid (AED, min 50)</span>
                <input
                  type="number"
                  min="50"
                  step="0.01"
                  value={amountAed}
                  onChange={(e) => setAmountAed(e.target.value)}
                  className="rounded border border-input bg-background px-2 py-1"
                  placeholder="e.g. 150"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Pitch</span>
                <textarea
                  value={pitch}
                  onChange={(e) => setPitch(e.target.value)}
                  rows={3}
                  maxLength={500}
                  className="rounded border border-input bg-background px-2 py-1"
                  placeholder="What you'd make and why you're a fit"
                />
              </label>
              {msg && (
                <p className={`text-sm ${msg.kind === "err" ? "text-destructive" : "text-green-600"}`}>{msg.text}</p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy || msg?.kind === "ok"}
                  onClick={submit}
                  className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
                >
                  {msg?.kind === "ok" ? "Bid placed" : busy ? "Placing…" : "Place bid"}
                </button>
                <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm hover:bg-accent">
                  Close
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
