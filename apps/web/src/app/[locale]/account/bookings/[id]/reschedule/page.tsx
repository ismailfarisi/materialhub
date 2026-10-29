"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useBooking, useServiceOfferingById, useVendorLocations } from "@/lib/queries/booking";
import { isValidTimeZone } from "@/lib/utils";
import { rescheduleWindowOpen } from "../../booking-display";
import { AvailabilityPicker } from "@/components/booking/availability-picker";
import { BookingRescheduleConfirm } from "@/components/booking/booking-reschedule-confirm";
import { Eyebrow, MAISON_SANS, MAISON_SERIF, SerifTitle } from "@/components/checkout/maison-primitives";

/**
 * Reschedule flow (task-3-brief.md's reschedule addendum): resolves the
 * booking's service_offering_id -> a full ServiceOffering via the Task 3
 * backend enabler (GET /services/by-id/:id — bookings only carry an id, not
 * a slug), then drives the SAME AvailabilityPicker the PDP uses, handed a
 * `buildContinueHref` that sends the slot selection back to THIS route
 * (query params) instead of /book/[slug] — mirroring the PDP -> /book/[slug]
 * contract exactly, just re-targeted. Once start/end land in the URL, the
 * picker gives way to BookingRescheduleConfirm (fresh hold + POST
 * /bookings/:id/reschedule).
 */

/**
 * `customer_address` is opaque JSON on the wire — the checkout flow that
 * builds it today never sets an `area_id` field (see task-3-report.md), but
 * per the brief this is checked defensively so a future write path that DOES
 * stamp one is honored instead of always re-asking.
 */
function extractAreaId(customerAddress: Record<string, unknown> | null): string | undefined {
  const value = customerAddress?.area_id;
  return typeof value === "string" ? value : undefined;
}

export default function BookingReschedulePage() {
  const t = useTranslations("booking.myBookings.reschedule");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const { data: booking, isLoading: bookingLoading, isError: bookingError } = useBooking(id);
  const { data: offering, isLoading: offeringLoading, isError: offeringError } = useServiceOfferingById(
    booking?.service_offering_id ?? undefined,
  );
  const { data: locations } = useVendorLocations(offering?.vendor_id);

  const start = searchParams.get("start") ?? undefined;
  const end = searchParams.get("end") ?? undefined;
  const tz = searchParams.get("tz") ?? undefined;
  const staff = searchParams.get("staff") ?? undefined;
  const location = searchParams.get("location") ?? undefined;
  const customerAreaId = searchParams.get("customer_area_id") ?? undefined;
  const mode = searchParams.get("mode") ?? undefined;

  if (bookingLoading) {
    return (
      <p style={{ fontFamily: MAISON_SERIF, fontStyle: "italic", fontSize: 16, color: "hsl(var(--nl-russet))" }}>
        {tCommon("loading")}
      </p>
    );
  }

  if (bookingError || !booking) {
    return <Blocked title={t("genericErrorTitle")} body={t("genericError")} bookingId={id} />;
  }

  if (booking.status !== "confirmed") {
    return <Blocked title={t("notConfirmedTitle")} body={t("notConfirmedBody")} bookingId={id} />;
  }

  if (!booking.service_offering_id) {
    return <Blocked title={t("noOfferingTitle")} body={t("noOfferingBody")} bookingId={id} />;
  }

  if (offeringLoading) {
    return (
      <p style={{ fontFamily: MAISON_SERIF, fontStyle: "italic", fontSize: 16, color: "hsl(var(--nl-russet))" }}>
        {tCommon("loading")}
      </p>
    );
  }

  if (offeringError || !offering) {
    return <Blocked title={t("genericErrorTitle")} body={t("genericError")} bookingId={id} />;
  }

  // ADVISORY, not a gate (see rescheduleWindowOpen): this reads the BROWSER's
  // clock, and a skewed device would dead-end a customer the server would
  // accept. The server is the authority — it answers 422
  // reschedule_window_expired, which BookingRescheduleConfirm already handles
  // with its own terminal screen. So warn and let them through.
  const windowLikelyClosed = !rescheduleWindowOpen(booking);

  // `tz` is an untrusted query param that flows into Intl via
  // formatDateInZone/formatTimeInZone; an invalid IANA name throws a
  // RangeError mid-render. Treat a bad zone as no selection so the picker
  // re-runs and re-stamps the offering's REAL zone, rather than guessing.
  const hasSelection = !!start && !!end && isValidTimeZone(tz);

  return (
    <div>
      <Eyebrow>{t("eyebrow")}</Eyebrow>
      <SerifTitle size={26} className="mt-1.5">
        {t("title")}
      </SerifTitle>

      {windowLikelyClosed && (
        <p
          className="mt-3 p-3"
          style={{
            fontFamily: MAISON_SANS,
            fontSize: 12,
            color: "hsl(var(--nl-russet))",
            border: "1px solid rgba(184,115,51,0.35)",
            background: "rgba(184,115,51,0.06)",
          }}
        >
          {t("windowClosedBody", { hours: booking.reschedule_window_hours })}
        </p>
      )}

      <div className="mt-5">
        {hasSelection ? (
          <BookingRescheduleConfirm
            booking={booking}
            offering={offering}
            locations={locations ?? []}
            selection={{ start: start!, end: end!, tz: tz!, staff, location, customerAreaId, mode }}
            onRescheduled={(updated) => {
              queryClient.setQueryData(["booking", "detail", id], updated);
              router.push(`/${locale}/account/bookings/${id}`);
            }}
          />
        ) : (
          <AvailabilityPicker
            offeringId={offering.id}
            offeringSlug={offering.slug}
            locationMode={offering.location_mode}
            locations={locations ?? []}
            maxAdvanceDays={offering.max_advance_days}
            initialAreaId={extractAreaId(booking.customer_address)}
            buildContinueHref={(params) =>
              `/${locale}/account/bookings/${id}/reschedule?${params.toString()}`
            }
          />
        )}
      </div>
    </div>
  );
}

function Blocked({ title, body, bookingId }: { title: string; body: string; bookingId: string }) {
  const t = useTranslations("booking.myBookings.reschedule");
  const locale = useLocale();
  return (
    <div>
      <SerifTitle size={22}>{title}</SerifTitle>
      <p className="mt-2 mb-4" style={{ fontFamily: MAISON_SANS, fontSize: 12.5, color: "hsl(var(--nl-russet))" }}>
        {body}
      </p>
      <Link
        href={`/${locale}/account/bookings/${bookingId}`}
        className="inline-block uppercase"
        style={{ fontFamily: MAISON_SANS, fontSize: 10.5, letterSpacing: "0.18em", color: "hsl(var(--nl-amber))" }}
      >
        {t("backToDetail")}
      </Link>
    </div>
  );
}
