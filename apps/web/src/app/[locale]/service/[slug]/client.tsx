"use client";

import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { AvailabilityPicker } from "@/components/booking/availability-picker";
import { TermsBlock } from "@/components/booking/terms-block";
import {
  Eyebrow,
  MAISON_SANS,
  SerifTitle,
} from "@/components/checkout/maison-primitives";
import type { ServiceOffering, VendorLocation } from "@/lib/booking/types";
import { formatPrice } from "@/lib/utils";

interface Props {
  offering: ServiceOffering;
  locations: VendorLocation[];
}

export function ServiceDetailClient({ offering, locations }: Props) {
  const t = useTranslations("service");
  const locale = useLocale();
  const vatRate = Number.parseFloat(offering.vat_rate) || 0;
  const heroImage = offering.media_urls?.[0];

  return (
    <div className="bg-background min-h-screen">
      <div className="container py-6 md:py-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
          {/* Media */}
          <div className="space-y-2">
            <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-muted">
              {heroImage ? (
                <Image
                  src={heroImage}
                  alt={offering.name}
                  fill
                  className="object-cover"
                  priority
                />
              ) : null}
            </div>
            {offering.media_urls?.length > 1 && (
              <div className="flex gap-2">
                {offering.media_urls.slice(1, 5).map((url) => (
                  <div
                    key={url}
                    className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-muted"
                  >
                    <Image src={url} alt="" fill className="object-cover" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Details + booking */}
          <div>
            <Eyebrow>{t("bookThisService")}</Eyebrow>
            <SerifTitle size={28} className="mt-2">
              {offering.name}
            </SerifTitle>

            <div
              className="mt-3 flex items-baseline gap-3"
              style={{ fontFamily: MAISON_SANS }}
            >
              <span
                style={{
                  fontSize: 20,
                  color: "hsl(var(--nl-cacao))",
                }}
              >
                {formatPrice(offering.price_fils, "AED", locale)}
              </span>
              <span style={{ fontSize: 12, color: "hsl(var(--nl-russet))" }}>
                {t("duration", { minutes: offering.duration_minutes })}
              </span>
            </div>
            {vatRate > 0 && (
              <p
                className="mt-1"
                style={{
                  fontFamily: MAISON_SANS,
                  fontSize: 11,
                  color: "hsl(var(--nl-russet))",
                }}
              >
                {t("vatIncluded", { rate: vatRate })}
              </p>
            )}

            {offering.description && (
              <p
                className="mt-4"
                style={{
                  fontFamily: MAISON_SANS,
                  fontSize: 13.5,
                  lineHeight: 1.6,
                  color: "hsl(var(--nl-cacao))",
                }}
              >
                {offering.description}
              </p>
            )}

            <div className="mt-6">
              <Eyebrow className="mb-3">{t("bookThisService")}</Eyebrow>
              <AvailabilityPicker
                offeringId={offering.id}
                offeringSlug={offering.slug}
                locationMode={offering.location_mode}
                locations={locations}
                maxAdvanceDays={offering.max_advance_days}
              />
            </div>

            <TermsBlock offering={offering} />
          </div>
        </div>
      </div>
    </div>
  );
}
