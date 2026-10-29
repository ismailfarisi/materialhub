"use client";

import { useLocale, useTranslations } from "next-intl";
import { formatPrice } from "@/lib/utils";
import { computeDepositFils } from "@/lib/booking/money";
import type { ServiceOffering } from "@/lib/booking/types";
import { Eyebrow } from "@/components/checkout/maison-primitives";

/**
 * Renders the offering's booking terms (cancellation/reschedule/deposit/
 * payment-mode copy) directly from GET /services/:slug fields — Task 2
 * re-renders the same fields at checkout, so keep this presentation-only
 * and driven entirely by props (no local business logic beyond formatting).
 */
export function TermsBlock({ offering }: { offering: ServiceOffering }) {
  const t = useTranslations("service.terms");
  const locale = useLocale();

  const paymentCopy =
    offering.payment_mode === "prepay"
      ? t("paymentModePrepay")
      : offering.payment_mode === "deposit"
        ? t("paymentModeDeposit", {
            amount: formatDepositAmount(offering, locale),
          })
        : t("paymentModePayAtVenue");

  const depositCopy =
    offering.payment_mode === "deposit" && offering.deposit_type !== "none"
      ? offering.deposit_type === "percent"
        ? t("depositPercent", { percent: offering.deposit_value })
        : t("depositFixed", { amount: formatPrice(offering.deposit_value, "AED", locale) })
      : null;

  const cancellationCopy =
    offering.cancellation_refund_policy === "full"
      ? t("cancellationFull", { hours: offering.cancellation_window_hours })
      : offering.cancellation_refund_policy === "deposit_forfeit"
        ? t("cancellationDepositForfeit", {
            hours: offering.cancellation_window_hours,
          })
        : t("cancellationPercent", {
            hours: offering.cancellation_window_hours,
            percent: offering.cancellation_penalty_percent ?? 0,
          });

  return (
    <div
      className="mt-6"
      style={{
        border: "1px solid rgba(44,24,16,0.08)",
        background: "rgba(44,24,16,0.015)",
        padding: 18,
      }}
    >
      <Eyebrow className="mb-2.5">{t("title")}</Eyebrow>
      <ul
        className="space-y-1.5"
        style={{
          fontFamily: "var(--font-inter-tight), var(--font-dm-sans), sans-serif",
          fontSize: 12.5,
          color: "hsl(var(--nl-cacao))",
          lineHeight: 1.5,
        }}
      >
        <li>{paymentCopy}</li>
        {depositCopy && <li>{depositCopy}</li>}
        <li>{cancellationCopy}</li>
        {offering.reschedule_window_hours > 0 && (
          <li>{t("reschedule", { hours: offering.reschedule_window_hours })}</li>
        )}
      </ul>
    </div>
  );
}

function formatDepositAmount(offering: ServiceOffering, locale: string): string {
  return formatPrice(computeDepositFils(offering), "AED", locale);
}
