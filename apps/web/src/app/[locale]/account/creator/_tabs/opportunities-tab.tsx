"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { MAISON_SANS } from "@/components/checkout/maison-primitives";
import { CollabCard } from "@/components/creator/collab-card";
import {
  Body,
  BUTTON_CLASS,
  ErrorNote,
  FilterChip,
  INPUT_CLASS,
  INPUT_STYLE,
  Quiet,
  SECONDARY_BUTTON_CLASS,
  SMALL_PRIMARY,
  SMALL_SECONDARY,
} from "@/components/creator/maison-ui";
import {
  type BoardRow,
  type CollabType,
  type EligibilityReason,
  applyToCollab,
  getCollabBoard,
} from "@/lib/api/collab";

function aed(fils: string | null): string {
  if (!fils) return "—";
  return `AED ${(Number(fils) / 100).toFixed(2)}`;
}

function closesIn(iso: string | null): string | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return null;
  const days = Math.floor(ms / 86_400_000);
  return days >= 1 ? `${days}d` : `${Math.floor(ms / 3_600_000)}h`;
}

export function OpportunitiesTab() {
  const t = useTranslations("account");
  const tc = useTranslations("common");
  const [rows, setRows] = useState<BoardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<CollabType | "">("");
  const [applyingTo, setApplyingTo] = useState<string | null>(null);
  const [pitch, setPitch] = useState("");
  const [busy, setBusy] = useState(false);
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());

  const typeLabel: Record<CollabType, string> = {
    product_seeding: t("collabTypeSeeding"),
    paid_campaign: t("collabTypeCampaign"),
    event_appearance: t("collabTypeAppearance"),
  };
  const reasonLabel: Record<EligibilityReason, string> = {
    below_min_followers: t("collabReasonFollowers"),
    category_mismatch: t("collabReasonCategory"),
    platform_not_connected: t("collabReasonPlatform"),
  };

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setRows(await getCollabBoard());
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

  async function submitApplication(opportunityId: string) {
    setBusy(true);
    setError(null);
    try {
      await applyToCollab(opportunityId, { pitch: pitch.trim() || null });
      setAppliedIds((s) => new Set(s).add(opportunityId));
      setApplyingTo(null);
      setPitch("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("collabApplyFailed"));
    } finally {
      setBusy(false);
    }
  }

  const visible = typeFilter ? rows.filter((r) => r.opportunity.type === typeFilter) : rows;

  return (
    <div className="space-y-4">
      <Body>{t("collabBoardIntro")}</Body>

      <div className="flex flex-wrap gap-2">
        <FilterChip active={typeFilter === ""} onClick={() => setTypeFilter("")}>
          {t("collabAllTypes")}
        </FilterChip>
        {(Object.keys(typeLabel) as CollabType[]).map((type) => (
          <FilterChip
            key={type}
            active={typeFilter === type}
            onClick={() => setTypeFilter(type)}
          >
            {typeLabel[type]}
          </FilterChip>
        ))}
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      {loading ? (
        <Quiet>{tc("loading")}</Quiet>
      ) : visible.length === 0 ? (
        <Quiet>{t("collabBoardEmpty")}</Quiet>
      ) : (
        <ul className="space-y-2.5">
          {visible.map(({ opportunity: o, eligibility }) => {
            const closing = closesIn(o.applications_close_at);
            const alreadyApplied = appliedIds.has(o.id);
            const blocked = eligibility && !eligibility.eligible;
            const slotsLeft = o.slots_total - o.slots_filled;

            return (
              <CollabCard
                key={o.id}
                opportunity={o}
                metaLine={
                  <>
                    {typeLabel[o.type]}
                    {closing ? ` · ${t("collabClosesIn", { time: closing })}` : ""}
                    {` · ${t("collabSlotsLeft", { count: slotsLeft })}`}
                    {` · ${
                      o.type === "product_seeding"
                        ? t("collabSeedUnits", { count: o.seeded_qty ?? 0 })
                        : aed(o.fee_fils)
                    }`}
                  </>
                }
              >
                <p
                  className="whitespace-pre-wrap normal-case tracking-normal"
                  style={{
                    fontFamily: MAISON_SANS,
                    fontSize: 12.5,
                    lineHeight: 1.5,
                    color: "hsl(var(--nl-russet))",
                  }}
                >
                  {o.description}
                </p>

                {/* Every open opportunity is listed, including ones this creator
                    cannot take. Saying why is more useful than hiding the row. */}
                {blocked && (
                  <ul className="mt-3 space-y-1">
                    {eligibility.reasons.map((r) => (
                      <li
                        key={r}
                        className="normal-case tracking-normal"
                        style={{
                          fontFamily: MAISON_SANS,
                          fontSize: 11.5,
                          color: "hsl(var(--nl-amber-text))",
                        }}
                      >
                        {reasonLabel[r]}
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-3">
                  {alreadyApplied ? (
                    <span
                      className="normal-case tracking-normal"
                      style={{
                        fontFamily: MAISON_SANS,
                        fontSize: 12.5,
                        color: "hsl(140,30%,32%)",
                      }}
                    >
                      {t("collabApplied")}
                    </span>
                  ) : applyingTo === o.id ? (
                    <div className="space-y-2 normal-case tracking-normal">
                      <textarea
                        className={INPUT_CLASS}
                        style={INPUT_STYLE}
                        rows={3}
                        placeholder={t("collabPitchPlaceholder")}
                        value={pitch}
                        onChange={(e) => setPitch(e.target.value)}
                      />
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => submitApplication(o.id)}
                          className={BUTTON_CLASS}
                          style={SMALL_PRIMARY}
                        >
                          {busy ? tc("loading") : t("collabSendApplication")}
                        </button>
                        <button
                          type="button"
                          onClick={() => setApplyingTo(null)}
                          className={SECONDARY_BUTTON_CLASS}
                          style={SMALL_SECONDARY}
                        >
                          {tc("cancel")}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={Boolean(blocked) || slotsLeft <= 0}
                      title={
                        blocked ? eligibility.reasons.map((r) => reasonLabel[r]).join(", ") : undefined
                      }
                      onClick={() => {
                        setApplyingTo(o.id);
                        setPitch("");
                      }}
                      className={BUTTON_CLASS}
                      style={SMALL_PRIMARY}
                    >
                      {t("collabApply")}
                    </button>
                  )}
                </div>
              </CollabCard>
            );
          })}
        </ul>
      )}
    </div>
  );
}
