"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useHoldBooking, useRescheduleBooking } from "@/lib/queries/booking";
import type { Booking, BookingHoldResponse, ServiceOffering, VendorLocation } from "@/lib/booking/types";
import { formatDateInZone, formatPrice, formatTimeInZone } from "@/lib/utils";
import { Eyebrow, MAISON_SANS, SerifTitle } from "@/components/checkout/maison-primitives";

/**
 * Reschedule confirm step — mirrors booking-checkout.tsx's hold->confirm
 * pipeline (fresh hold on mount, live countdown, 409/expired handling), but
 * MUCH simpler: no payment, no address form (POST /bookings/:id/reschedule
 * doesn't accept customer_address, only customer_area_id — the customer's
 * home-visit address itself never changes via reschedule), and the
 * staff-binding rule is identical to checkout's: the body MUST echo the
 * HOLD's resolved staff_member_id (never the raw query-param selection),
 * since the hold is server-bound to `hold:{staff}:{range}`.
 */

const HOLD_COUNTDOWN_INTERVAL_MS = 1000;

type Phase =
  | "holding"
  | "hold-conflict"
  | "hold-error"
  | "form"
  | "hold-expired"
  | "confirming"
  | "confirm-conflict"
  | "confirm-window-expired"
  | "confirm-error"
  | "success";

interface Selection {
  start: string;
  end: string;
  tz: string;
  staff?: string;
  location?: string;
  customerAreaId?: string;
  mode?: string;
}

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Raw backend detail text, extracted for display as a SECONDARY line under
// the translated primary message — never as the primary copy itself (a raw
// untranslated backend string standing alone fails the "422 codes -> friendly
// copy" requirement). Returns null when there's nothing usable to show.
function extractErrorDetail(err: unknown): string | null {
  const error = err as { response?: { data?: { message?: string } }; message?: string };
  return error.response?.data?.message || error.message || null;
}

export function BookingRescheduleConfirm({
  booking,
  offering,
  locations,
  selection,
  onRescheduled,
}: {
  booking: Booking;
  offering: ServiceOffering;
  locations: VendorLocation[];
  selection: Selection;
  onRescheduled: (updated: Booking) => void;
}) {
  const t = useTranslations("booking.myBookings.reschedule");
  const tCommon = useTranslations("common");
  const locale = useLocale();

  const holdMutation = useHoldBooking();
  const rescheduleMutation = useRescheduleBooking();

  const [phase, setPhase] = useState<Phase>("holding");
  const [holdData, setHoldData] = useState<BookingHoldResponse | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  // errorMessage is always translated friendly copy (never raw backend text)
  // — the raw backend message, when present, goes in errorDetail as a
  // secondary line instead.
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  const holdRequested = useRef(false);
  /** Synchronous re-entrancy lock — same pattern as booking-checkout.tsx /
   * booking-payment.tsx. `disabled={submitting}` is state-based and only bites
   * after a re-render, so a same-frame double-tap could fire two
   * POST /bookings/:id/reschedule against the same hold token. */
  const submitLockRef = useRef(false);
  const holdExpiresAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (holdRequested.current) return;
    holdRequested.current = true;
    holdMutation
      .mutateAsync({
        offering_id: offering.id,
        starts_at: selection.start,
        ends_at: selection.end,
        staff_member_id: selection.staff ?? null,
        location_id: selection.location ?? null,
        customer_area_id: selection.customerAreaId ?? null,
      })
      .then((data) => {
        setHoldData(data);
        holdExpiresAtRef.current = Date.now() + data.expires_in_seconds * 1000;
        setSecondsLeft(data.expires_in_seconds);
        setPhase("form");
      })
      .catch((err: unknown) => {
        const error = err as { response?: { status?: number; data?: { message?: string } }; message?: string };
        if (error.response?.status === 409) {
          setPhase("hold-conflict");
        } else {
          // Any non-409 hold failure (including a 422, e.g. the vendor
          // unpublished the offering mid-flow) falls back to translated
          // friendly copy — never the raw backend message as primary text.
          setErrorMessage(t("genericError"));
          setErrorDetail(extractErrorDetail(err));
          setPhase("hold-error");
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase !== "form") return;
    const interval = setInterval(() => {
      if (!holdExpiresAtRef.current) return;
      const remaining = Math.max(0, Math.round((holdExpiresAtRef.current - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining <= 0) setPhase("hold-expired");
    }, HOLD_COUNTDOWN_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [phase]);

  const staffLabel = holdData?.staff_member_id ? t("staffAssigned") : t("staffAutoAssign");
  const locationRecord = useMemo(
    () => locations.find((l) => l.id === selection.location) ?? null,
    [locations, selection.location],
  );

  const dateTimeLabel = `${formatDateInZone(selection.start, selection.tz, locale)} · ${formatTimeInZone(
    selection.start,
    selection.tz,
    locale,
  )} – ${formatTimeInZone(selection.end, selection.tz, locale)}`;

  async function handleConfirm() {
    if (!holdData) return;
    if (submitLockRef.current) return;
    submitLockRef.current = true;
    setPhase("confirming");
    setErrorMessage(null);
    setErrorDetail(null);
    try {
      const result = await rescheduleMutation.mutateAsync({
        bookingId: booking.id,
        body: {
          starts_at: selection.start,
          ends_at: selection.end,
          // Echo the HOLD's resolved staff, never the raw query-param
          // selection — same rule booking-checkout.tsx follows for create.
          staff_member_id: holdData.staff_member_id,
          location_id: selection.location ?? null,
          customer_area_id: selection.customerAreaId ?? null,
          hold_token: holdData.hold_token,
        },
      });
      onRescheduled(result.booking);
      setPhase("success");
    } catch (err: unknown) {
      const error = err as {
        response?: { status?: number; data?: { message?: string; error?: string } };
        message?: string;
      };
      if (error.response?.status === 409) {
        setPhase("confirm-conflict");
      } else if (error.response?.status === 422 && error.response.data?.error === "reschedule_window_expired") {
        setPhase("confirm-window-expired");
      } else {
        // Any other reachable 422 (or non-422 failure) falls back to
        // translated friendly copy as the PRIMARY message — never the raw,
        // untranslated backend `message` string. The raw text (when present)
        // is still surfaced as a secondary detail line for debuggability.
        setErrorMessage(t("genericError"));
        setErrorDetail(extractErrorDetail(err));
        setPhase("confirm-error");
      }
    } finally {
      submitLockRef.current = false;
    }
  }

  if (phase === "holding") {
    return (
      <p style={{ fontFamily: MAISON_SANS, fontSize: 13, color: "hsl(var(--nl-russet))" }}>{t("holding")}</p>
    );
  }

  if (phase === "hold-conflict" || phase === "hold-expired" || phase === "confirm-conflict") {
    const title = phase === "hold-expired" ? t("holdExpiredTitle") : t("conflictTitle");
    const body = phase === "hold-expired" ? t("holdExpiredBody") : t("conflictBody");
    return <RePick title={title} body={body} bookingId={booking.id} />;
  }

  if (phase === "confirm-window-expired") {
    return (
      <RePick
        title={t("windowExpiredTitle")}
        body={t("windowClosedBody", { hours: booking.reschedule_window_hours })}
        bookingId={booking.id}
        backToDetailOnly
      />
    );
  }

  if (phase === "hold-error" || phase === "confirm-error") {
    return (
      <RePick
        title={t("genericErrorTitle")}
        body={errorMessage || t("genericError")}
        detail={errorDetail}
        bookingId={booking.id}
      />
    );
  }

  if (phase === "success") {
    return (
      <div>
        <SerifTitle size={22}>{t("successTitle")}</SerifTitle>
        <p className="mt-2" style={{ fontFamily: MAISON_SANS, fontSize: 13, color: "hsl(var(--nl-cacao))" }}>
          {dateTimeLabel}
        </p>
        <Link
          href={`/${locale}/account/bookings/${booking.id}`}
          className="mt-4 inline-block uppercase"
          style={{ fontFamily: MAISON_SANS, fontSize: 10.5, letterSpacing: "0.18em", color: "hsl(var(--nl-amber))" }}
        >
          {t("backToDetail")}
        </Link>
      </div>
    );
  }

  const submitting = phase === "confirming";

  return (
    <div>
      <Eyebrow>{t("eyebrow")}</Eyebrow>
      <SerifTitle size={24} className="mt-1.5">
        {t("formTitle")}
      </SerifTitle>

      {secondsLeft !== null && (
        <p className="mt-2" style={{ fontFamily: MAISON_SANS, fontSize: 12, color: "hsl(var(--nl-amber))" }}>
          {t("holdCountdown", { time: formatCountdown(secondsLeft) })}
        </p>
      )}

      <div className="mt-5" style={{ border: "1px solid rgba(44,24,16,0.08)", background: "rgba(44,24,16,0.015)", padding: 18 }}>
        <SummaryRow label={t("summaryService")} value={offering.name} />
        <SummaryRow label={t("summaryDateTime")} value={dateTimeLabel} />
        {locationRecord && <SummaryRow label={t("summaryLocation")} value={locationRecord.name} />}
        <SummaryRow label={t("summaryProfessional")} value={staffLabel} />
      </div>

      {errorMessage && (
        <div
          className="mt-4 p-3 text-sm"
          style={{ background: "rgba(220, 38, 38, 0.06)", border: "1px solid rgba(220, 38, 38, 0.3)", color: "hsl(var(--destructive))" }}
        >
          <p>{errorMessage}</p>
          {errorDetail && (
            <p className="mt-1" style={{ fontSize: 11.5, opacity: 0.75 }}>
              {errorDetail}
            </p>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={handleConfirm}
        disabled={submitting}
        className="w-full uppercase mt-6 transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
        style={{
          background: "hsl(var(--nl-cacao))",
          color: "hsl(var(--nl-linen))",
          padding: "18px 0",
          fontSize: 11,
          letterSpacing: "0.28em",
          border: "none",
        }}
      >
        {submitting ? tCommon("loading") : t("confirmButton")}
      </button>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span
        className="uppercase shrink-0"
        style={{ fontFamily: MAISON_SANS, fontSize: 10, letterSpacing: "0.12em", color: "hsl(var(--nl-russet))" }}
      >
        {label}
      </span>
      <span className="text-end" style={{ fontFamily: MAISON_SANS, fontSize: 13, color: "hsl(var(--nl-cacao))" }}>
        {value}
      </span>
    </div>
  );
}

function RePick({
  title,
  body,
  detail,
  bookingId,
  backToDetailOnly,
}: {
  title: string;
  body: string;
  /** Raw backend detail text, rendered as a secondary line below `body` — never as the primary copy. */
  detail?: string | null;
  bookingId: string;
  backToDetailOnly?: boolean;
}) {
  const t = useTranslations("booking.myBookings.reschedule");
  const locale = useLocale();
  return (
    <div>
      <SerifTitle size={22}>{title}</SerifTitle>
      <p className={detail ? "mt-2" : "mt-2 mb-4"} style={{ fontFamily: MAISON_SANS, fontSize: 12.5, color: "hsl(var(--nl-russet))" }}>
        {body}
      </p>
      {detail && (
        <p className="mt-1 mb-4" style={{ fontFamily: MAISON_SANS, fontSize: 11, opacity: 0.75, color: "hsl(var(--nl-russet))" }}>
          {detail}
        </p>
      )}
      {!backToDetailOnly && (
        <Link
          href={`/${locale}/account/bookings/${bookingId}/reschedule`}
          className="inline-block uppercase me-4"
          style={{ fontFamily: MAISON_SANS, fontSize: 10.5, letterSpacing: "0.18em", color: "hsl(var(--nl-amber))" }}
        >
          {t("pickAgain")}
        </Link>
      )}
      <Link
        href={`/${locale}/account/bookings/${bookingId}`}
        className="inline-block uppercase"
        style={{ fontFamily: MAISON_SANS, fontSize: 10.5, letterSpacing: "0.18em", color: "hsl(var(--nl-russet))" }}
      >
        {t("backToDetail")}
      </Link>
    </div>
  );
}
