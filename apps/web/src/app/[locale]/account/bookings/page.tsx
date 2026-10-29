"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useMyBookingsBucket } from "@/lib/queries/booking";
import { formatDateInZone, formatPrice, formatTimeInZone } from "@/lib/utils";
import type { Booking } from "@/lib/booking/types";
import { BOOKING_STATUS_BADGE_STYLE, bookingStatusTone } from "@/lib/booking/status";
import { resolveBookingTimeZone } from "./booking-display";
import {
  Eyebrow,
  SerifTitle,
  MAISON_SERIF,
  MAISON_SANS,
} from "@/components/checkout/maison-primitives";


type Bucket = "upcoming" | "past";

export default function MyBookingsPage() {
  const t = useTranslations("booking.myBookings");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const [bucket, setBucket] = useState<Bucket>("upcoming");

  const query = useMyBookingsBucket(bucket);

  const bookings = useMemo(() => {
    const seen = new Set<string>();
    const merged: Booking[] = [];
    for (const page of query.data?.pages ?? []) {
      for (const b of page.bookings) {
        if (seen.has(b.id)) continue;
        seen.add(b.id);
        merged.push(b);
      }
    }
    merged.sort((a, b) => {
      const diff = new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime();
      return bucket === "upcoming" ? diff : -diff;
    });
    return merged;
  }, [query.data, bucket]);

  const total = query.data?.pages[0]?.total ?? 0;

  return (
    <div>
      <div className="mb-5">
        <Eyebrow>{t("eyebrow")}</Eyebrow>
        <SerifTitle size={26} className="mt-1.5">
          {t("title")}
        </SerifTitle>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-5" role="tablist" aria-label={t("title")}>
        {(["upcoming", "past"] as const).map((b) => (
          <button
            key={b}
            type="button"
            role="tab"
            aria-selected={bucket === b}
            onClick={() => setBucket(b)}
            className="px-4 py-2 uppercase transition-colors"
            style={{
              fontFamily: MAISON_SANS,
              fontSize: 10.5,
              letterSpacing: "0.18em",
              border: `1px solid ${bucket === b ? "hsl(var(--nl-amber))" : "rgba(44,24,16,0.16)"}`,
              background: bucket === b ? "rgba(184,115,51,0.08)" : "transparent",
              color: bucket === b ? "hsl(var(--nl-espresso))" : "hsl(var(--nl-russet))",
            }}
          >
            {b === "upcoming" ? t("tabUpcoming") : t("tabPast")}
          </button>
        ))}
      </div>

      {query.isPending ? (
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
      ) : query.isError ? (
        <div
          className="py-8 text-center"
          style={{ border: "1px solid rgba(184,60,40,0.3)" }}
        >
          <p style={{ fontFamily: MAISON_SANS, fontSize: 12.5, color: "hsl(var(--nl-russet))" }}>
            {t("loadError")}
          </p>
          <button
            type="button"
            onClick={() => query.refetch()}
            className="mt-2 uppercase"
            style={{
              fontFamily: MAISON_SANS,
              fontSize: 10.5,
              letterSpacing: "0.16em",
              color: "hsl(var(--nl-amber))",
            }}
          >
            {tCommon("retry")}
          </button>
        </div>
      ) : bookings.length === 0 ? (
        <div
          className="py-12 text-center"
          style={{
            fontFamily: MAISON_SERIF,
            fontStyle: "italic",
            fontSize: 16,
            color: "hsl(var(--nl-russet))",
          }}
        >
          {t("noBookings")}
        </div>
      ) : (
        <>
          <div className="space-y-2 md:space-y-3">
            {bookings.map((booking) => {
              const tone = bookingStatusTone(booking.status);
              const style = BOOKING_STATUS_BADGE_STYLE[tone];
              // Vendors can operate outside Asia/Dubai (LocationForm offers
              // Asia/Riyadh, Africa/Cairo, Asia/Kolkata, UTC and preserves
              // arbitrary zones), so never silently assert a zone: when the
              // booking doesn't carry one, say which zone we're showing.
              const zone = resolveBookingTimeZone(booking);
              return (
                <Link
                  key={booking.id}
                  href={`/${locale}/account/bookings/${booking.id}`}
                  className="block p-3.5 md:p-4 transition-colors"
                  style={{
                    border: "1px solid rgba(44,24,16,0.10)",
                    background: "rgba(44,24,16,0.02)",
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="truncate"
                      style={{ fontFamily: MAISON_SANS, fontSize: 13, color: "hsl(var(--nl-cacao))" }}
                    >
                      {booking.service_name}
                    </span>
                    <span
                      className="uppercase whitespace-nowrap"
                      style={{
                        fontFamily: MAISON_SANS,
                        fontSize: 10,
                        letterSpacing: "0.18em",
                        padding: "3px 8px",
                        ...style,
                      }}
                    >
                      {t(`status.${booking.status}` as any)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-1.5">
                    <span
                      className="truncate"
                      style={{ fontFamily: MAISON_SANS, fontSize: 12, color: "hsl(var(--nl-russet))" }}
                    >
                      {formatDateInZone(booking.starts_at, zone.timeZone, locale)} ·{" "}
                      {formatTimeInZone(booking.starts_at, zone.timeZone, locale)}
                      {!zone.confirmed && ` (${zone.timeZone})`}
                    </span>
                    <span
                      className="whitespace-nowrap"
                      style={{ fontFamily: MAISON_SERIF, fontSize: 15, color: "hsl(var(--nl-cacao))" }}
                    >
                      {formatPrice(booking.price_fils, "AED", locale)}
                    </span>
                  </div>
                  <div
                    className="mt-1 truncate"
                    style={{ fontFamily: MAISON_SANS, fontSize: 11, color: "hsl(var(--nl-russet))" }}
                  >
                    #{booking.booking_number}
                  </div>
                </Link>
              );
            })}
          </div>

          <div
            className="mt-4 text-center"
            style={{ fontFamily: MAISON_SANS, fontSize: 11, color: "hsl(var(--nl-russet))" }}
          >
            {t("showingCount", { shown: bookings.length, total })}
          </div>

          {query.hasNextPage && (
            <div className="mt-3 text-center">
              <button
                type="button"
                onClick={() => query.fetchNextPage()}
                disabled={query.isFetchingNextPage}
                className="uppercase disabled:opacity-50"
                style={{
                  fontFamily: MAISON_SANS,
                  fontSize: 10.5,
                  letterSpacing: "0.18em",
                  color: "hsl(var(--nl-amber))",
                }}
              >
                {query.isFetchingNextPage ? tCommon("loading") : t("loadMore")}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
