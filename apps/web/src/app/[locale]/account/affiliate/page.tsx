"use client";

import {
  Eyebrow,
  MAISON_SANS,
  MAISON_SERIF,
  SerifTitle,
} from "@/components/checkout/maison-primitives";
import {
  useAcceptAffiliation,
  useAffiliateEarnings,
  useAffiliateLinks,
  useAffiliations,
  useCreateAffiliateLink,
  useRequestPayout,
} from "@/lib/queries/affiliate";
import { Check, Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

const PANEL = {
  border: "1px solid rgba(44,24,16,0.10)",
  background: "rgba(44,24,16,0.02)",
} as const;

interface Affiliation {
  id: string;
  vendor_id: string;
  affiliate_code: string;
  status: string;
}

interface AffiliateLinkRow {
  id: string;
  slug: string;
  target_type: "store" | "product";
  target_id: string | null;
  click_count: number;
}

interface EarningsRow {
  status: string;
  total_fils: string | number;
  count: number;
}

function AffiliationLinks({ affiliation }: { affiliation: Affiliation }) {
  const t = useTranslations("account.affiliate");
  const { data: links = [], isLoading } = useAffiliateLinks(affiliation.id);
  const createLink = useCreateAffiliateLink(affiliation.id);
  const [targetType, setTargetType] = useState<"store" | "product">("store");
  const [targetId, setTargetId] = useState("");
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  // window is only touched inside this click handler — SSR-safe.
  const copyLink = (slug: string) => {
    if (typeof window === "undefined") return;
    navigator.clipboard.writeText(`${window.location.origin}/a/${slug}`);
    setCopiedSlug(slug);
    setTimeout(() => setCopiedSlug((s) => (s === slug ? null : s)), 2000);
  };

  const handleGenerate = () => {
    createLink.mutate({
      targetType,
      targetId: targetType === "product" ? targetId || null : null,
    });
    setTargetId("");
  };

  return (
    <div className="mt-3 pt-3" style={{ borderTop: "1px solid rgba(44,24,16,0.08)" }}>
      <Eyebrow>{t("links")}</Eyebrow>

      {!isLoading && links.length === 0 && (
        <p
          className="mt-2"
          style={{
            fontFamily: MAISON_SANS,
            fontSize: 12,
            color: "hsl(var(--nl-russet))",
          }}
        >
          {t("noLinks")}
        </p>
      )}

      {links.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {links.map((link: AffiliateLinkRow) => (
            <div key={link.id} className="flex items-center justify-between gap-2 flex-wrap">
              <code
                className="text-xs break-all"
                style={{ fontFamily: MAISON_SANS, color: "hsl(var(--nl-cacao))" }}
              >
                /a/{link.slug}
              </code>
              <span
                style={{
                  fontFamily: MAISON_SANS,
                  fontSize: 11,
                  color: "hsl(var(--nl-russet))",
                }}
              >
                {link.target_type === "product" ? t("targetProduct") : t("targetStore")}
                {" · "}
                {t("clicks", { count: link.click_count ?? 0 })}
              </span>
              <button
                type="button"
                onClick={() => copyLink(link.slug)}
                className="flex items-center gap-1 uppercase transition-colors hover:bg-[rgba(44,24,16,0.04)]"
                style={{
                  fontFamily: MAISON_SANS,
                  fontSize: 10,
                  letterSpacing: "0.12em",
                  padding: "4px 8px",
                  border: "1px solid rgba(44,24,16,0.3)",
                  color: "hsl(var(--nl-cacao))",
                }}
              >
                {copiedSlug === link.slug ? (
                  <Check className="h-3 w-3" style={{ color: "hsl(var(--nl-amber))" }} />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
                {copiedSlug === link.slug ? t("copied") : t("copy")}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          value={targetType}
          onChange={(e) => setTargetType(e.target.value as "store" | "product")}
          className="text-xs"
          style={{
            fontFamily: MAISON_SANS,
            border: "1px solid rgba(44,24,16,0.2)",
            padding: "6px 8px",
            background: "transparent",
          }}
        >
          <option value="store">{t("targetStore")}</option>
          <option value="product">{t("targetProduct")}</option>
        </select>
        {targetType === "product" && (
          <input
            type="text"
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            placeholder={t("targetIdPlaceholder")}
            className="text-xs"
            style={{
              fontFamily: MAISON_SANS,
              border: "1px solid rgba(44,24,16,0.2)",
              padding: "6px 8px",
              background: "transparent",
              minWidth: 160,
            }}
          />
        )}
        <button
          type="button"
          onClick={handleGenerate}
          disabled={createLink.isPending || (targetType === "product" && !targetId)}
          className="uppercase transition-colors disabled:opacity-50"
          style={{
            fontFamily: MAISON_SANS,
            fontSize: 10.5,
            letterSpacing: "0.18em",
            padding: "7px 14px",
            border: "1px solid hsl(var(--nl-amber))",
            color: "hsl(var(--nl-espresso))",
            background: "hsl(var(--nl-amber))",
          }}
        >
          {t("generate")}
        </button>
      </div>
    </div>
  );
}

export default function AffiliatePage() {
  const t = useTranslations("account.affiliate");
  const tCommon = useTranslations("common");
  const { data: affiliations = [], isLoading: affiliationsLoading } = useAffiliations();
  const { data: earnings = [], isLoading: earningsLoading } = useAffiliateEarnings();
  const accept = useAcceptAffiliation();
  const payout = useRequestPayout();

  const invited = (affiliations as Affiliation[]).filter((a) => a.status === "invited");
  const active = (affiliations as Affiliation[]).filter((a) => a.status === "active");

  const earnedFils = Number(
    (earnings as EarningsRow[]).find((e) => e.status === "earned")?.total_fils ?? 0,
  );

  const payoutErrorCode = (payout.error as { response?: { data?: { error?: string } } } | null)
    ?.response?.data?.error;

  return (
    <div>
      <div className="mb-5">
        <Eyebrow>{t("title")}</Eyebrow>
        <SerifTitle size={26} className="mt-1.5">
          {t("title")}
        </SerifTitle>
        <p
          className="mt-2"
          style={{ fontFamily: MAISON_SANS, fontSize: 13, color: "hsl(var(--nl-russet))" }}
        >
          {t("subtitle")}
        </p>
      </div>

      {affiliationsLoading ? (
        <div
          style={{
            fontFamily: MAISON_SERIF,
            fontStyle: "italic",
            fontSize: 16,
            color: "hsl(var(--nl-russet))",
          }}
        >
          {tCommon("loading")}
        </div>
      ) : (
        <div className="space-y-8">
          {/* Pending invites */}
          <section>
            <Eyebrow>{t("invites")}</Eyebrow>
            {invited.length === 0 ? (
              <p
                className="mt-2"
                style={{ fontFamily: MAISON_SANS, fontSize: 13, color: "hsl(var(--nl-russet))" }}
              >
                {t("noInvites")}
              </p>
            ) : (
              <div className="mt-2 space-y-2">
                {invited.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between gap-3 px-3.5 md:px-4 py-3"
                    style={PANEL}
                  >
                    <code
                      style={{
                        fontFamily: MAISON_SANS,
                        fontSize: 13,
                        color: "hsl(var(--nl-cacao))",
                      }}
                    >
                      {a.affiliate_code}
                    </code>
                    <button
                      type="button"
                      onClick={() => accept.mutate(a.id)}
                      disabled={accept.isPending}
                      className="uppercase transition-colors disabled:opacity-50"
                      style={{
                        fontFamily: MAISON_SANS,
                        fontSize: 10.5,
                        letterSpacing: "0.18em",
                        padding: "7px 14px",
                        border: "1px solid hsl(var(--nl-amber))",
                        color: "hsl(var(--nl-espresso))",
                        background: "hsl(var(--nl-amber))",
                      }}
                    >
                      {t("accept")}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Active affiliations */}
          <section>
            <Eyebrow>{t("active")}</Eyebrow>
            {active.length === 0 ? (
              <p
                className="mt-2"
                style={{ fontFamily: MAISON_SANS, fontSize: 13, color: "hsl(var(--nl-russet))" }}
              >
                {t("noActive")}
              </p>
            ) : (
              <div className="mt-2 space-y-4">
                {active.map((a) => (
                  <div key={a.id} className="p-4" style={PANEL}>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span
                        style={{
                          fontFamily: MAISON_SANS,
                          fontSize: 11,
                          color: "hsl(var(--nl-russet))",
                        }}
                      >
                        {t("code")}
                      </span>
                      <code
                        style={{
                          fontFamily: MAISON_SANS,
                          fontSize: 13,
                          color: "hsl(var(--nl-cacao))",
                        }}
                      >
                        {a.affiliate_code}
                      </code>
                    </div>
                    <AffiliationLinks affiliation={a} />
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Earnings */}
          <section>
            <Eyebrow>{t("earnings")}</Eyebrow>
            {earningsLoading ? (
              <p
                className="mt-2"
                style={{ fontFamily: MAISON_SANS, fontSize: 13, color: "hsl(var(--nl-russet))" }}
              >
                {tCommon("loading")}
              </p>
            ) : (earnings as EarningsRow[]).length === 0 ? (
              <p
                className="mt-2"
                style={{ fontFamily: MAISON_SANS, fontSize: 13, color: "hsl(var(--nl-russet))" }}
              >
                {t("noEarnings")}
              </p>
            ) : (
              <div className="mt-2 space-y-1.5">
                {(earnings as EarningsRow[]).map((e) => {
                  let label: string;
                  try {
                    // biome-ignore lint/suspicious/noExplicitAny: dynamic status key against a fixed i18n enum
                    label = t(`status.${e.status}` as any);
                  } catch {
                    label = e.status;
                  }
                  return (
                    <div
                      key={e.status}
                      className="flex items-center justify-between px-3.5 md:px-4 py-2.5"
                      style={PANEL}
                    >
                      <span
                        style={{
                          fontFamily: MAISON_SANS,
                          fontSize: 13,
                          color: "hsl(var(--nl-cacao))",
                        }}
                      >
                        {label} ({e.count})
                      </span>
                      <span
                        style={{
                          fontFamily: MAISON_SERIF,
                          fontSize: 15,
                          color: "hsl(var(--nl-amber))",
                        }}
                      >
                        {`AED ${(Number(e.total_fils) / 100).toFixed(2)}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-4">
              <button
                type="button"
                onClick={() => payout.mutate()}
                disabled={earnedFils <= 0 || payout.isPending}
                className="uppercase transition-colors disabled:opacity-50"
                style={{
                  fontFamily: MAISON_SANS,
                  fontSize: 10.5,
                  letterSpacing: "0.18em",
                  padding: "10px 18px",
                  border: "1px solid hsl(var(--nl-amber))",
                  color: "hsl(var(--nl-espresso))",
                  background: "hsl(var(--nl-amber))",
                }}
              >
                {t("requestPayout")}
              </button>
              {payout.isSuccess && (
                <p
                  className="mt-2"
                  style={{ fontFamily: MAISON_SANS, fontSize: 12, color: "hsl(140,30%,32%)" }}
                >
                  {t("payoutSuccess")}
                </p>
              )}
              {payout.isError && (
                <p
                  className="mt-2"
                  style={{ fontFamily: MAISON_SANS, fontSize: 12, color: "hsl(var(--nl-russet))" }}
                >
                  {payoutErrorCode === "payout_below_threshold"
                    ? t("payoutBelowThreshold")
                    : t("payoutFailed")}
                </p>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
