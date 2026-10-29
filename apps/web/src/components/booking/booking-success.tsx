"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Eyebrow, MAISON_SANS, MaisonMark, SerifTitle } from "@/components/checkout/maison-primitives";
import type { Booking, OfferingStaffMember, VendorLocation } from "@/lib/booking/types";
import { formatDateInZone, formatPrice, formatTimeInZone } from "@/lib/utils";

export function BookingSuccess({
  locale,
  booking,
  staffMember,
  locationRecord,
  customerAreaName,
  tz,
}: {
  locale: string;
  booking: Booking;
  staffMember: OfferingStaffMember | null;
  locationRecord: VendorLocation | null;
  customerAreaName: string | null;
  tz: string;
}) {
  const t = useTranslations("booking.checkout");
  const tBooking = useTranslations("booking");

  const chargedCopy =
    booking.payment_mode === "pay_at_venue"
      ? t("successChargedPayAtVenue", { amount: formatPrice(booking.price_fils, "AED", locale) })
      : booking.payment_mode === "deposit"
        ? t("successChargedDeposit", {
            deposit: formatPrice(booking.deposit_fils, "AED", locale),
            balance: formatPrice(Math.max(booking.price_fils - booking.deposit_fils, 0), "AED", locale),
          })
        : t("successChargedPrepay", { amount: formatPrice(booking.price_fils, "AED", locale) });

  return (
    <div className="mt-6">
      <div className="flex items-center gap-2 mb-3">
        <MaisonMark size={18} />
        <Eyebrow amber>{t("successTitle")}</Eyebrow>
      </div>
      <SerifTitle size={24}>{booking.service_name}</SerifTitle>

      <div
        className="mt-5"
        style={{
          border: "1px solid rgba(44,24,16,0.08)",
          background: "rgba(44,24,16,0.015)",
          padding: 18,
        }}
      >
        <SummaryRow label={t("successBookingNumber")} value={booking.booking_number} />
        <SummaryRow
          label={t("successDateTime")}
          value={`${formatDateInZone(booking.starts_at, tz, locale)} · ${formatTimeInZone(
            booking.starts_at,
            tz,
            locale,
          )} – ${formatTimeInZone(booking.ends_at, tz, locale)}`}
        />
        <SummaryRow
          label={t("successProfessional")}
          value={staffMember ? staffMember.name : tBooking("stub.autoAssign")}
        />
        {locationRecord && <SummaryRow label={t("successLocation")} value={locationRecord.name} />}
        {!locationRecord && customerAreaName && (
          <SummaryRow label={t("successAddress")} value={customerAreaName} />
        )}
      </div>

      <p
        className="mt-4"
        style={{ fontFamily: MAISON_SANS, fontSize: 13, color: "hsl(var(--nl-cacao))" }}
      >
        {chargedCopy}
      </p>

      <Link
        href={`/${locale}/account/bookings`}
        className="mt-6 inline-block uppercase"
        style={{
          fontFamily: MAISON_SANS,
          fontSize: 10.5,
          letterSpacing: "0.18em",
          color: "hsl(var(--nl-amber))",
        }}
      >
        {t("viewBookings")}
      </Link>
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
