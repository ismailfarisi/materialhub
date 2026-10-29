import { apiServer } from "@/lib/api-server";
import type { OfferingStaffMember, ServiceOffering, VendorLocation } from "@/lib/booking/types";
import type { DeliveryZone } from "@/lib/queries/areas";
import { BookingCheckout } from "@/components/booking/booking-checkout";
import { Eyebrow, MAISON_SANS, SerifTitle } from "@/components/checkout/maison-primitives";
import { isValidTimeZone } from "@/lib/utils";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import Link from "next/link";

/**
 * Booking checkout — behind the /book/[slug] handoff contract Task 1 built
 * (see .superpowers/sdd/task-1-report.md's "Handoff contract for Task 2").
 * This server component re-fetches GET /services/:slug + the offering's
 * staff/locations (and delivery-zone name, for home-visit) itself rather
 * than trusting any client-carried offering state, then hands off to the
 * client-side BookingCheckout component for the interactive
 * hold -> terms -> [address] -> create -> pay -> poll -> success flow.
 */

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{
    start?: string;
    end?: string;
    tz?: string;
    staff?: string;
    location?: string;
    customer_area_id?: string;
    mode?: string;
  }>;
}

export default async function BookingCheckoutPage({ params, searchParams }: Props) {
  const { locale, slug } = await params;
  const { start, end, tz, staff, location, customer_area_id, mode } = await searchParams;
  setRequestLocale(locale);

  const t = await getTranslations("booking");
  const tService = await getTranslations("service");

  const server = await apiServer(locale);

  const offering: ServiceOffering | null = await server
    .get(`/services/${slug}`)
    .then((r) => r.data.data)
    .catch(() => null);

  // A stale link to a draft/paused/archived offering must 404 here exactly as
  // it does on the service PDP (service/[slug]/page.tsx) — otherwise the
  // customer dead-ends at a checkout for something they can't book.
  if (!offering || offering.status !== "published") notFound();

  //  is an untrusted query param that flows straight into
  // Intl.DateTimeFormat via formatDateInZone/formatTimeInZone. An invalid IANA
  // name would throw a RangeError mid-render (white screen), so validate at the
  // boundary and treat a bad zone as NO selection — bouncing the customer back
  // to the picker to re-choose against the offering's real zone, rather than
  // silently rendering their appointment in some other zone.
  const missingSelection = !start || !end || !isValidTimeZone(tz);

  if (missingSelection) {
    return (
      <div className="bg-background min-h-screen">
        <div className="container max-w-xl py-10 md:py-16">
          <Eyebrow>{tService("bookThisService")}</Eyebrow>
          <SerifTitle size={26} className="mt-2">
            {t("checkout.title")}
          </SerifTitle>
          <div
            className="mt-6 py-6 px-4 text-center"
            style={{ border: "1px solid rgba(184,60,40,0.3)" }}
          >
            <p style={{ fontFamily: MAISON_SANS, fontSize: 12.5, color: "hsl(var(--nl-russet))" }}>
              {t("stub.missing")}
            </p>
            <Link
              href={`/${locale}/service/${slug}`}
              className="mt-3 inline-block uppercase"
              style={{
                fontFamily: MAISON_SANS,
                fontSize: 10.5,
                letterSpacing: "0.18em",
                color: "hsl(var(--nl-amber))",
              }}
            >
              {t("stub.backToService")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const [staffList, locations, areas] = await Promise.all([
    server
      .get(`/booking/offerings/${offering.id}/staff`)
      .then((r) => (r.data.data as OfferingStaffMember[] | undefined) ?? [])
      .catch(() => []),
    server
      .get(`/booking/vendors/${offering.vendor_id}/locations`)
      .then((r) => (r.data.data as VendorLocation[] | undefined) ?? [])
      .catch(() => []),
    customer_area_id
      ? server
          .get(`/shipping/delivery-zones`)
          .then((r) => (r.data.data as DeliveryZone[] | undefined) ?? [])
          .catch(() => [])
      : Promise.resolve([] as DeliveryZone[]),
  ]);

  const customerAreaName =
    (customer_area_id && areas.find((a) => a.id === customer_area_id)?.name) || null;

  return (
    <BookingCheckout
      locale={locale}
      slug={slug}
      offering={offering}
      staffList={staffList}
      locations={locations}
      customerAreaName={customerAreaName}
      selection={{
        start: start!,
        end: end!,
        tz: tz!,
        staff,
        location,
        customerAreaId: customer_area_id,
        mode,
      }}
    />
  );
}
