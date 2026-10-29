"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Eyebrow, MAISON_SANS, MAISON_SERIF } from "@/components/checkout/maison-primitives";
import { CollabCard } from "@/components/creator/collab-card";
import {
  BOX,
  BUTTON_CLASS,
  ErrorNote,
  Pill,
  Quiet,
  SECONDARY_BUTTON_CLASS,
  SMALL_PRIMARY,
  SMALL_QUIET,
  SMALL_SECONDARY,
  type Tone,
} from "@/components/creator/maison-ui";
import {
  type CollabApplication,
  type CollabApplicationStatus,
  type CreatorApplicationRow,
  confirmCollabReceipt,
  getMyCollabs,
  respondToInvite,
  withdrawCollab,
} from "@/lib/api/collab";
import { AddressStep } from "./_components/address-step";
import { CollabDeliverDialog } from "./_components/collab-deliver-dialog";

/** Amber = something is still moving, green = done, red = ended badly, grey = closed. */
const STATUS_TONE: Record<CollabApplicationStatus, Tone> = {
  invited: "amber",
  applied: "amber",
  accepted: "amber",
  in_progress: "amber",
  delivered: "amber",
  revision_requested: "amber",
  completed: "success",
  declined: "muted",
  withdrawn: "muted",
  rejected: "danger",
  expired: "muted",
};

function due(iso: string | null): string | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "overdue";
  const days = Math.floor(ms / 86_400_000);
  return days >= 1 ? `${days}d` : `${Math.floor(ms / 3_600_000)}h`;
}

export function MyCollabsTab() {
  const t = useTranslations("account");
  const tc = useTranslations("common");
  const [rows, setRows] = useState<CreatorApplicationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [addressFor, setAddressFor] = useState<CollabApplication | null>(null);
  const [deliverFor, setDeliverFor] = useState<CollabApplication | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setRows(await getMyCollabs());
    } catch (err) {
      setError(err instanceof Error ? err.message : t("collabLoadFailed"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run(id: string, fn: () => Promise<unknown>) {
    setBusyId(id);
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("collabActionFailed"));
    } finally {
      setBusyId(null);
    }
  }

  const invites = rows.filter((r) => r.application.status === "invited");
  const active = rows.filter((r) =>
    ["applied", "accepted", "in_progress", "delivered", "revision_requested"].includes(
      r.application.status,
    ),
  );
  const past = rows.filter((r) => !invites.includes(r) && !active.includes(r));

  function card(row: CreatorApplicationRow) {
    const a = row.application;
    const deadline = due(a.deliver_by);

    // An opportunity is only ever null if it was hard-deleted, which this
    // domain never does (soft delete only) — fall back to a bare status row
    // rather than crash if that invariant is ever violated.
    if (!row.opportunity) {
      return (
        <li key={a.id} className="p-3.5" style={BOX}>
          <Quiet>
            {t(`collabStatus_${a.status}` as never)} — opportunity unavailable
          </Quiet>
        </li>
      );
    }

    const metaSegments = [
      a.revision_count > 0 ? t("collabRevisions", { count: a.revision_count }) : null,
      deadline ? t("collabDueIn", { time: deadline }) : null,
    ].filter((segment): segment is string => segment !== null);

    return (
      <CollabCard
        key={a.id}
        opportunity={row.opportunity}
        metaLine={metaSegments.join(" · ")}
      >
        <Pill tone={STATUS_TONE[a.status]}>{t(`collabStatus_${a.status}` as never)}</Pill>

        {/* The vendor's note, when they wrote one. Quoted and set in the serif
            so it reads as someone speaking, not as another status field. */}
        {a.invite_note && (
          <blockquote
            className="mt-2.5 ps-3 normal-case tracking-normal"
            style={{
              borderInlineStart: "2px solid rgba(184,115,51,0.4)",
              fontFamily: MAISON_SERIF,
              fontStyle: "italic",
              fontSize: 14,
              lineHeight: 1.45,
              color: "hsl(var(--nl-cacao))",
            }}
          >
            “{a.invite_note}”
          </blockquote>
        )}

        {a.tracking_number && (
          <p
            className="mt-2 normal-case tracking-normal"
            style={{
              fontFamily: MAISON_SANS,
              fontSize: 11.5,
              color: "hsl(var(--nl-russet))",
            }}
          >
            {a.carrier} · {a.tracking_number}
          </p>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          {a.status === "invited" && (
            <>
              <button
                type="button"
                disabled={busyId === a.id}
                onClick={() => run(a.id, () => respondToInvite(a.id, true))}
                className={BUTTON_CLASS}
                style={SMALL_PRIMARY}
              >
                {t("collabAcceptInvite")}
              </button>
              <button
                type="button"
                disabled={busyId === a.id}
                onClick={() => run(a.id, () => respondToInvite(a.id, false))}
                className={SECONDARY_BUTTON_CLASS}
                style={SMALL_SECONDARY}
              >
                {t("collabDeclineInvite")}
              </button>
            </>
          )}

          {a.status === "accepted" && !a.shipping_address_id && (
            <button
              type="button"
              onClick={() => setAddressFor(a)}
              className={BUTTON_CLASS}
              style={SMALL_PRIMARY}
            >
              {t("collabChooseAddress")}
            </button>
          )}

          {a.status === "in_progress" && !a.received_at && (
            <button
              type="button"
              disabled={busyId === a.id}
              onClick={() => run(a.id, () => confirmCollabReceipt(a.id))}
              className={BUTTON_CLASS}
              style={SMALL_PRIMARY}
            >
              {t("collabConfirmReceipt")}
            </button>
          )}

          {["accepted", "in_progress", "revision_requested"].includes(a.status) && (
            <button
              type="button"
              onClick={() => setDeliverFor(a)}
              className={SECONDARY_BUTTON_CLASS}
              style={SMALL_SECONDARY}
            >
              {t("collabSubmitWork")}
            </button>
          )}

          {["applied", "invited", "accepted", "in_progress"].includes(a.status) && (
            <button
              type="button"
              disabled={busyId === a.id}
              onClick={() => run(a.id, () => withdrawCollab(a.id))}
              className={`${BUTTON_CLASS} hover:bg-[rgba(44,24,16,0.04)]`}
              style={SMALL_QUIET}
            >
              {t("collabWithdraw")}
            </button>
          )}
        </div>
      </CollabCard>
    );
  }

  return (
    <div className="space-y-4">
      {error && <ErrorNote>{error}</ErrorNote>}

      {loading ? (
        <Quiet>{tc("loading")}</Quiet>
      ) : rows.length === 0 ? (
        <Quiet>{t("collabMineEmpty")}</Quiet>
      ) : (
        <div className="space-y-7">
          {invites.length > 0 && (
            <section>
              <Eyebrow className="mb-3">{t("collabInvites")}</Eyebrow>
              <ul className="space-y-2.5">{invites.map(card)}</ul>
            </section>
          )}
          {active.length > 0 && (
            <section>
              <Eyebrow className="mb-3">{t("collabActive")}</Eyebrow>
              <ul className="space-y-2.5">{active.map(card)}</ul>
            </section>
          )}
          {past.length > 0 && (
            <section>
              <Eyebrow className="mb-3">{t("collabPast")}</Eyebrow>
              <ul className="space-y-2.5">{past.map(card)}</ul>
            </section>
          )}
        </div>
      )}

      {addressFor && (
        <AddressStep
          application={addressFor}
          onClose={() => setAddressFor(null)}
          onSaved={() => {
            setAddressFor(null);
            load();
          }}
        />
      )}
      {deliverFor && (
        <CollabDeliverDialog
          application={deliverFor}
          onClose={() => setDeliverFor(null)}
          onDelivered={() => {
            setDeliverFor(null);
            load();
          }}
        />
      )}
    </div>
  );
}
