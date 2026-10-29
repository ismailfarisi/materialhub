"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { formatDate, formatPrice } from "@/lib/utils";
import { useMyReferralCode, useMyReferrals } from "@/lib/queries/account";
import { Copy, Check } from "lucide-react";
import {
  Eyebrow,
  SerifTitle,
  MAISON_SERIF,
  MAISON_SANS,
} from "@/components/checkout/maison-primitives";

const PANEL = {
  border: "1px solid rgba(44,24,16,0.10)",
  background: "rgba(44,24,16,0.02)",
} as const;

function StatusBadge({ status }: { status: string }) {
  const tStatus = useTranslations("account.referralStatus");
  const colors: Record<string, string> = {
    pending: "hsl(var(--nl-russet))",
    signed_up: "hsl(var(--nl-cacao))",
    completed: "hsl(var(--nl-amber))",
    rewarded: "hsl(140,30%,32%)",
    expired: "rgba(44,24,16,0.4)",
  };
  let label: string;
  try {
    label = tStatus(status as any);
  } catch {
    label = status?.replace(/_/g, " ") || "";
  }
  return (
    <span
      className="uppercase whitespace-nowrap"
      style={{
        fontFamily: MAISON_SANS,
        fontSize: 10,
        letterSpacing: "0.18em",
        padding: "3px 8px",
        border: `1px solid ${colors[status] || "rgba(44,24,16,0.4)"}`,
        color: colors[status] || "rgba(44,24,16,0.4)",
      }}
    >
      {label}
    </span>
  );
}

export default function ReferralsPage() {
  const t = useTranslations("account");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const { data: codeData, isLoading: codeLoading } = useMyReferralCode();
  const { data: referralsData, isLoading: referralsLoading } = useMyReferrals();
  const [copied, setCopied] = useState(false);

  const referralCode = codeData?.referral_code;
  const referrals = referralsData?.items || [];

  const copyCode = () => {
    if (!referralCode) return;
    navigator.clipboard.writeText(`${window.location.origin}/ref/${referralCode}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (codeLoading)
    return (
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
    );

  return (
    <div>
      <div className="mb-5">
        <Eyebrow>REFERRALS</Eyebrow>
        <SerifTitle size={26} className="mt-1.5">
          {t("referrals")}
        </SerifTitle>
      </div>

      {/* Referral Code Card */}
      <div className="p-5 md:p-6 mb-5 md:mb-6" style={PANEL}>
        <Eyebrow>{t("yourReferralCode")}</Eyebrow>
        <p
          className="mt-2 mb-3"
          style={{
            fontFamily: MAISON_SANS,
            fontSize: 13,
            color: "hsl(var(--nl-russet))",
          }}
        >
          {t("referralDescription")}
        </p>
        {referralCode ? (
          <div className="flex flex-wrap items-center gap-2">
            <code
              className="px-3 sm:px-4 py-2 text-base sm:text-lg font-mono tracking-wider break-all"
              style={{
                border: "1px solid rgba(44,24,16,0.2)",
                background: "rgba(255,255,255,0.55)",
                color: "hsl(var(--nl-cacao))",
              }}
            >
              {referralCode}
            </code>
            <button
              type="button"
              onClick={copyCode}
              className="flex items-center gap-1.5 shrink-0 uppercase transition-colors hover:bg-[rgba(44,24,16,0.04)]"
              style={{
                fontFamily: MAISON_SANS,
                fontSize: 11,
                letterSpacing: "0.18em",
                padding: "10px 16px",
                border: "1px solid rgba(44,24,16,0.4)",
                color: "hsl(var(--nl-cacao))",
              }}
            >
              {copied ? (
                <Check className="h-4 w-4" style={{ color: "hsl(var(--nl-amber))" }} />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              {copied ? tCommon("copied") : tCommon("copy")}
            </button>
          </div>
        ) : (
          <p
            style={{
              fontFamily: MAISON_SANS,
              fontSize: 13,
              color: "hsl(var(--nl-russet))",
            }}
          >
            {t("noReferralCode")}
          </p>
        )}
      </div>

      {/* Referrals List */}
      <div>
        <div className="flex items-baseline gap-2.5 mb-3">
          <Eyebrow>{t("referredUsers")}</Eyebrow>
        </div>

        {referralsLoading ? (
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
        ) : referrals.length === 0 ? (
          <div
            className="py-12 text-center"
            style={{
              fontFamily: MAISON_SERIF,
              fontStyle: "italic",
              fontSize: 16,
              color: "hsl(var(--nl-russet))",
            }}
          >
            {t("noReferrals")}
          </div>
        ) : (
          <div className="space-y-2">
            {referrals.map((ref: any) => (
              <div
                key={ref.id}
                className="flex items-center justify-between gap-3 px-3.5 md:px-4 py-3 transition-colors hover:bg-[rgba(44,24,16,0.03)]"
                style={PANEL}
              >
                <div className="min-w-0 flex-1">
                  <p
                    className="truncate"
                    style={{
                      fontFamily: MAISON_SANS,
                      fontSize: 14,
                      color: "hsl(var(--nl-cacao))",
                    }}
                  >
                    {ref.referred_email}
                  </p>
                  <p
                    style={{
                      fontFamily: MAISON_SANS,
                      fontSize: 12,
                      color: "hsl(var(--nl-russet))",
                    }}
                  >
                    {formatDate(ref.created_at, locale)}
                  </p>
                </div>
                <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                  {ref.referrer_reward_amount && (
                    <span
                      className="whitespace-nowrap"
                      style={{
                        fontFamily: MAISON_SERIF,
                        fontSize: 15,
                        color: "hsl(var(--nl-amber))",
                      }}
                    >
                      +{formatPrice(ref.referrer_reward_amount, "AED", locale)}
                    </span>
                  )}
                  <StatusBadge status={ref.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
