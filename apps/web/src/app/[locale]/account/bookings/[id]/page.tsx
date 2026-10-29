"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useBooking } from "@/lib/queries/booking";
import { formatDateInZone, formatPrice, formatTimeInZone } from "@/lib/utils";
import type { CancelBookingResponse } from "@/lib/booking/types";
import { BOOKING_STATUS_BADGE_STYLE, bookingStatusTone } from "@/lib/booking/status";
import { rescheduleWindowOpen, resolveBookingTimeZone } from "../booking-display";
import { BookingCancelPanel } from "@/components/booking/booking-cancel-panel";
import { BookingReviewForm } from "@/components/booking/booking-review-form";
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

export default function BookingDetailPage() {
  const t = useTranslations("booking.myBookings");
  const tCheckout = useTranslations("booking.checkout");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { data: booking, isLoading, isError } = useBooking(id);

  const [cancelResult, setCancelResult] = useState<CancelBookingResponse | null>(null);
  const [reviewState, setReviewState] = useState<"idle" | "submitted" | "already">("idle");

  if (isLoading) {
    return (
      <div
        style={{ fontFamily: MAISON_SERIF, fontStyle: "italic", fontSize: 16, color: "hsl(var(--nl-russet))" }}
      >
        {tCommon("loading")}
      </div>
    );
  }

  if (isError || !booking) {
    return (
      <div>
        <div
          className="py-8 text-center"
          style={{ border: "1px solid rgba(184,60,40,0.3)" }}
        >
          <p style={{ fontFamily: MAISON_SANS, fontSize: 12.5, color: "hsl(var(--nl-russet))" }}>
            {t("notFound")}
          </p>
          <Link
            href={`/${locale}/account/bookings`}
            className="mt-2 inline-block uppercase"
            style={{ fontFamily: MAISON_SANS, fontSize: 10.5, letterSpacing: "0.18em", color: "hsl(var(--nl-amber))" }}
          >
            {t("backToBookings")}
          </Link>
        </div>
      </div>
    );
  }

  const tone = bookingStatusTone(booking.status);
  const style = BOOKING_STATUS_BADGE_STYLE[tone];

  // Status-aware "what was charged" panel — derived from payment_mode +
  // deposit_fils/price_fils + STATUS (task-3-brief.md). A booking whose
  // status has since moved on can't be described with the same
  // forward-looking checkout-success copy: pending_payment hasn't actually
  // been charged yet, cancelled/no_show already had a refund/forfeit applied
  // (per policy, at the time — we don't have that visit's actual API
  // response on a later page load, so this is deliberately generic/honest
  // rather than a fabricated number), and expired never captured anything.
  // confirmed/rescheduled (the latter is a transient marker that always
  // lands back on confirmed — booking-status.service.ts) and completed keep
  // the existing forward-looking copy, reused from the checkout success
  // screen.
  let chargedCopy: string;
  if (booking.status === "pending_payment") {
    chargedCopy = t("paymentStatus.pendingPayment");
  } else if (booking.status === "cancelled") {
    chargedCopy = t("paymentStatus.cancelled");
  } else if (booking.status === "expired") {
    chargedCopy = t("paymentStatus.expired");
  } else if (booking.status === "no_show") {
    chargedCopy = t("paymentStatus.noShow");
  } else {
    chargedCopy =
      booking.payment_mode === "pay_at_venue"
        ? tCheckout("successChargedPayAtVenue", { amount: formatPrice(booking.price_fils, "AED", locale) })
        : booking.payment_mode === "deposit"
          ? tCheckout("successChargedDeposit", {
              deposit: formatPrice(booking.deposit_fils, "AED", locale),
              balance: formatPrice(Math.max(booking.price_fils - booking.deposit_fils, 0), "AED", locale),
            })
          : tCheckout("successChargedPrepay", { amount: formatPrice(booking.price_fils, "AED", locale) });
  }

  const canReschedule = booking.status === "confirmed";
  const canCancel = booking.status === "confirmed";
  const canReview = booking.status === "completed";
  // ADVISORY only — see rescheduleWindowOpen's doc comment. A skewed browser
  // clock must not lock the customer out of a reschedule the server would
  // accept, so this warns but never disables the link.
  const windowLikelyClosed = canReschedule && !rescheduleWindowOpen(booking);
  const zone = resolveBookingTimeZone(booking);

  function handleCancelled(result: CancelBookingResponse) {
    setCancelResult(result);
    queryClient.setQueryData(["booking", "detail", id], result.booking);
  }

  const rowLabel = { fontFamily: MAISON_SANS, fontSize: 13, color: "hsl(var(--nl-russet))" } as const;
  const rowValue = { fontFamily: MAISON_SANS, fontSize: 13, color: "hsl(var(--nl-cacao))" } as const;

  return (
    <div>
      <div className="mb-5 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <Eyebrow>{t("eyebrowDetail")}</Eyebrow>
          <SerifTitle size={26} className="mt-1.5 break-words">
            {booking.service_name}
          </SerifTitle>
        </div>
        <span
          className="uppercase whitespace-nowrap"
          style={{ fontFamily: MAISON_SANS, fontSize: 10, letterSpacing: "0.18em", padding: "4px 10px", ...style }}
        >
          {t(`status.${booking.status}` as any)}
        </span>
      </div>

      <div className="p-4 mb-3 space-y-2" style={PANEL}>
        <div className="flex justify-between gap-2">
          <span style={rowLabel}>{t("fieldBookingNumber")}</span>
          <span className="text-end" style={rowValue}>
            {booking.booking_number}
          </span>
        </div>
        <div className="flex justify-between gap-2">
          <span style={rowLabel}>{t("fieldDateTime")}</span>
          <span className="text-end" style={rowValue}>
            {formatDateInZone(booking.starts_at, zone.timeZone, locale)} ·{" "}
            {formatTimeInZone(booking.starts_at, zone.timeZone, locale)} –{" "}
            {formatTimeInZone(booking.ends_at, zone.timeZone, locale)}
            {!zone.confirmed && ` (${zone.timeZone})`}
          </span>
        </div>
        <div className="flex justify-between gap-2">
          <span style={rowLabel}>{t("fieldPrice")}</span>
          <span style={rowValue}>{formatPrice(booking.price_fils, "AED", locale)}</span>
        </div>
        {booking.vat_fils > 0 && (
          <div className="flex justify-between gap-2">
            <span style={rowLabel}>{t("fieldVat")}</span>
            <span style={rowValue}>{formatPrice(booking.vat_fils, "AED", locale)}</span>
          </div>
        )}
        {booking.notes && (
          <div className="flex justify-between gap-2">
            <span style={rowLabel}>{t("fieldNotes")}</span>
            <span className="text-end break-words" style={rowValue}>
              {booking.notes}
            </span>
          </div>
        )}
      </div>

      {/* What was / will be charged — dead columns (amount_paid_fils/balance_due_fils/
          paid_at_venue) are never rendered; this is derived from payment_mode +
          deposit_fils/price_fils, reusing the exact checkout success-screen copy. */}
      <div className="p-4 mb-3" style={PANEL}>
        <Eyebrow className="mb-2">{t("fieldPayment")}</Eyebrow>
        <p style={{ fontFamily: MAISON_SANS, fontSize: 13, color: "hsl(var(--nl-cacao))" }}>{chargedCopy}</p>
      </div>

      {/* Cancel result (source of truth, from the actual API response) */}
      {cancelResult && (
        <div className="p-4 mb-3" style={PANEL}>
          <Eyebrow className="mb-2">{t("cancel.resultTitle")}</Eyebrow>
          <p style={{ fontFamily: MAISON_SANS, fontSize: 13, color: "hsl(var(--nl-cacao))" }}>
            {t(`cancel.resultAction.${cancelResult.action}` as any)}
          </p>
          {cancelResult.refund_fils > 0 && (
            <p className="mt-1" style={{ fontFamily: MAISON_SANS, fontSize: 13, color: "hsl(var(--nl-cacao))" }}>
              {t("cancel.resultRefund", { amount: formatPrice(cancelResult.refund_fils, "AED", locale) })}
            </p>
          )}
          {cancelResult.forfeit_fils > 0 && (
            <p className="mt-1" style={{ fontFamily: MAISON_SANS, fontSize: 13, color: "hsl(var(--nl-cacao))" }}>
              {t("cancel.resultForfeit", { amount: formatPrice(cancelResult.forfeit_fils, "AED", locale) })}
            </p>
          )}
        </div>
      )}

      {/* Actions */}
      {!cancelResult && (canReschedule || canCancel) && (
        <div className="p-4 mb-3" style={PANEL}>
          <Eyebrow className="mb-2.5">{t("fieldActions")}</Eyebrow>
          <div className="flex flex-wrap gap-3 items-center">
            {canReschedule && (
              <Link
                href={`/${locale}/account/bookings/${id}/reschedule`}
                className="uppercase hover:underline"
                style={{ fontFamily: MAISON_SANS, fontSize: 10, letterSpacing: "0.16em", color: "hsl(var(--nl-amber))" }}
              >
                {t("reschedule.trigger")}
              </Link>
            )}
            {canCancel && <BookingCancelPanel booking={booking} onCancelled={handleCancelled} />}
          </div>
          {windowLikelyClosed && (
            <p className="mt-2" style={{ fontFamily: MAISON_SANS, fontSize: 11.5, color: "hsl(var(--nl-russet))" }}>
              {t("reschedule.windowClosedBody", { hours: booking.reschedule_window_hours })}
            </p>
          )}
        </div>
      )}

      {/* Review (completed only) */}
      {canReview && (
        <div className="mb-3">
          {reviewState === "already" ? (
            <div className="p-4" style={PANEL}>
              <p style={{ fontFamily: MAISON_SANS, fontSize: 13, color: "hsl(var(--nl-cacao))" }}>
                {t("review.alreadyReviewed")}
              </p>
            </div>
          ) : reviewState === "submitted" ? (
            <div className="p-4" style={PANEL}>
              <p style={{ fontFamily: MAISON_SANS, fontSize: 13, color: "hsl(var(--nl-cacao))" }}>
                {t("review.submitted")}
              </p>
            </div>
          ) : (
            <BookingReviewForm
              bookingId={booking.id}
              onSubmitted={() => setReviewState("submitted")}
              onAlreadyReviewed={() => setReviewState("already")}
            />
          )}
        </div>
      )}

      <Link
        href={`/${locale}/account/bookings`}
        className="mt-2 inline-block uppercase hover:underline"
        style={{ fontFamily: MAISON_SANS, fontSize: 10.5, letterSpacing: "0.18em", color: "hsl(var(--nl-russet))" }}
      >
        {t("backToBookings")}
      </Link>
    </div>
  );
}
