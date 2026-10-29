"use client";

import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useCancelBooking } from "@/lib/queries/booking";
import { computeCancelEstimate } from "@/lib/booking/cancel-estimate";
import type { Booking, CancelBookingResponse } from "@/lib/booking/types";
import { formatPrice } from "@/lib/utils";
import { Eyebrow, MAISON_SANS } from "@/components/checkout/maison-primitives";

/**
 * Cancel flow (confirmed bookings only) — task-3-brief.md's cancel addendum:
 * shows a CLIENT-SIDE estimate of the outcome before the customer confirms
 * (computeCancelEstimate, mirrors the booking-service's own math but is
 * explicitly labelled an estimate), then a reason (optional) + confirm
 * button that fires POST /bookings/:id/cancel. The response's actual
 * `within_window`/`refund_fils`/`forfeit_fils`/`action` is handed back to
 * the parent (detail page) via `onCancelled` to render as the result of
 * record — this component never re-displays its own estimate as if it were
 * final.
 */
export function BookingCancelPanel({
  booking,
  onCancelled,
}: {
  booking: Booking;
  onCancelled: (result: CancelBookingResponse) => void;
}) {
  const t = useTranslations("booking.myBookings.cancel");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const cancelMutation = useCancelBooking();

  const [expanded, setExpanded] = useState(false);
  const [reason, setReason] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  /** Synchronous re-entrancy lock — same pattern as booking-checkout.tsx and
   * booking-payment.tsx. `disabled={cancelMutation.isPending}` is state-based
   * and only takes effect after a re-render, so a same-frame double-tap could
   * fire two POST /bookings/:id/cancel — and cancel triggers a REFUND. Locked
   * for the whole cancel round-trip, released in `finally`. */
  const submitLockRef = useRef(false);

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="uppercase hover:underline"
        style={{ fontFamily: MAISON_SANS, fontSize: 10, letterSpacing: "0.16em", color: "hsl(var(--nl-amber))" }}
      >
        {t("trigger")}
      </button>
    );
  }

  const estimate = computeCancelEstimate(booking);

  const estimateCopy =
    estimate.kind === "no_charge"
      ? t("estimateNoCharge")
      : estimate.kind === "full_refund_deposit"
        ? t("estimateFullRefund", { amount: formatPrice(estimate.amountFils, "AED", locale) })
        : estimate.kind === "forfeit_deposit"
          ? t("estimateForfeitDeposit", { amount: formatPrice(estimate.amountFils, "AED", locale) })
          : estimate.kind === "penalty_percent_prepay_conditional"
            ? t("estimatePenaltyPercentPrepayConditional", {
                percent: estimate.penaltyPercent ?? 0,
                amount: formatPrice(estimate.amountFils, "AED", locale),
              })
            : t("estimatePenaltyPercent", {
                percent: estimate.penaltyPercent ?? 0,
                amount: formatPrice(estimate.amountFils, "AED", locale),
              });

  async function handleConfirm() {
    if (submitLockRef.current) return;
    submitLockRef.current = true;
    setErrorMessage(null);
    try {
      const result = await cancelMutation.mutateAsync({
        bookingId: booking.id,
        body: { reason: reason.trim() || undefined },
      });
      onCancelled(result);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } }; message?: string };
      setErrorMessage(error.response?.data?.message || error.message || t("genericError"));
    } finally {
      submitLockRef.current = false;
    }
  }

  return (
    <div className="mt-4 p-4" style={{ border: "1px solid rgba(140,55,45,0.25)", background: "rgba(140,55,45,0.03)" }}>
      <Eyebrow amber={false}>{t("confirmTitle")}</Eyebrow>

      <p className="mt-2" style={{ fontFamily: MAISON_SANS, fontSize: 13, color: "hsl(var(--nl-cacao))" }}>
        {estimateCopy}
      </p>
      <p className="mt-1" style={{ fontFamily: MAISON_SANS, fontSize: 11, fontStyle: "italic", color: "hsl(var(--nl-russet))" }}>
        {t("estimateNote")}
      </p>

      <label
        htmlFor="cancel-reason"
        className="block uppercase mt-3 mb-1.5"
        style={{ fontFamily: MAISON_SANS, fontSize: 10, letterSpacing: "0.18em", color: "hsl(var(--nl-russet))" }}
      >
        {t("reasonLabel")}
      </label>
      <textarea
        id="cancel-reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={t("reasonPlaceholder")}
        rows={2}
        className="w-full outline-none"
        style={{
          fontFamily: MAISON_SANS,
          fontSize: 13,
          color: "hsl(var(--nl-cacao))",
          border: "1px solid rgba(44,24,16,0.16)",
          background: "rgba(255,255,255,0.7)",
          padding: "10px 14px",
        }}
      />

      {errorMessage && (
        <p className="mt-2" style={{ fontFamily: MAISON_SANS, fontSize: 12, color: "hsl(var(--destructive))" }}>
          {errorMessage}
        </p>
      )}

      <div className="flex flex-wrap gap-2 mt-3">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={cancelMutation.isPending}
          className="uppercase disabled:opacity-50"
          style={{
            background: "rgb(140,55,45)",
            color: "hsl(var(--nl-linen))",
            fontFamily: MAISON_SANS,
            fontSize: 11,
            letterSpacing: "0.2em",
            padding: "11px 22px",
            border: "none",
          }}
        >
          {cancelMutation.isPending ? tCommon("loading") : t("confirmButton")}
        </button>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          disabled={cancelMutation.isPending}
          className="uppercase"
          style={{
            background: "transparent",
            border: "1px solid rgba(44,24,16,0.3)",
            color: "hsl(var(--nl-cacao))",
            fontFamily: MAISON_SANS,
            fontSize: 11,
            letterSpacing: "0.2em",
            padding: "11px 22px",
          }}
        >
          {t("dismissButton")}
        </button>
      </div>
    </div>
  );
}
