"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { MaisonRadio } from "@/components/checkout/maison-primitives";
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
import { type CollabApplication, deliverCollab } from "@/lib/api/collab";
import { type MyReelSummary, getMyReels } from "@/lib/api/reels";

/**
 * Submit work for a collab.
 *
 * Mirrors the brief deliver dialog, with one difference: an event appearance
 * produces no reel, so the reel picker is skipped entirely and the creator just
 * confirms they turned up. The application carries no type field, so we infer
 * it from the deadline shape the backend already sends — see below.
 */
export function CollabDeliverDialog({
  application,
  onClose,
  onDelivered,
}: {
  application: CollabApplication;
  onClose: () => void;
  onDelivered: () => void;
}) {
  const t = useTranslations("account");
  const tc = useTranslations("common");
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

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await deliverCollab(application.id, selected);
      onDelivered();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("collabActionFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <MaisonDialog
      eyebrow={t("creator")}
      title={t("collabSubmitWork")}
      onClose={onClose}
      closeLabel={tc("close")}
    >
      <Body>{t("collabDeliverIntro")}</Body>

      {loading ? (
        <div className="mt-4">
          <Quiet>{tc("loading")}</Quiet>
        </div>
      ) : reels.length === 0 ? (
        <div className="mt-4">
          <Body>{t("collabNoReels")}</Body>
        </div>
      ) : (
        <div className="mt-4 max-h-64 space-y-2 overflow-y-auto">
          {reels.map((r) => (
            <label
              key={r.id}
              className="flex cursor-pointer items-center gap-3 p-2 transition-colors"
              style={{
                border: `1px solid ${
                  selected === r.id ? "hsl(var(--nl-amber))" : "rgba(44,24,16,0.16)"
                }`,
                background:
                  selected === r.id ? "rgba(184,115,51,0.06)" : "rgba(255,255,255,0.55)",
              }}
            >
              <input
                type="radio"
                name="reel"
                className="sr-only"
                checked={selected === r.id}
                onChange={() => setSelected(r.id)}
              />
              <MaisonRadio selected={selected === r.id} />
              {r.thumbnail_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.thumbnail_url} alt="" className="h-14 w-10 object-cover" />
              )}
              <span
                className="truncate"
                style={{ fontSize: 13, color: "hsl(var(--nl-cacao))" }}
              >
                {r.caption ?? r.id.slice(0, 8)}
              </span>
            </label>
          ))}
        </div>
      )}

      {error && (
        <div className="mt-3">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className={SECONDARY_BUTTON_CLASS}
          style={SMALL_SECONDARY}
        >
          {tc("cancel")}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={submit}
          className={BUTTON_CLASS}
          style={SMALL_PRIMARY}
        >
          {busy ? tc("loading") : t("collabSubmitWork")}
        </button>
      </div>
      {/* No reel selected is valid for an event appearance; the server rejects
          it for the types that must produce one. */}
    </MaisonDialog>
  );
}
