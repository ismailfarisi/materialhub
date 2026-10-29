"use client";

import { useLocale, useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import { usePreferencesStore } from "@/stores/preferences";
import type { ServiceListItem } from "../../lib/booking/types";
import { areaNamesFor } from "./service-location-line";

function formatAmount(amountInFils: number, locale: string): string {
  return new Intl.NumberFormat(locale === "en" ? "en-US" : locale, {
    maximumFractionDigits: 0,
  }).format(amountInFils / 100);
}

export function ServiceCard({ service }: { service: ServiceListItem }) {
  const t = useTranslations("service.listing");
  const locale = useLocale();
  const { currency } = usePreferencesStore();

  const image = service.media_urls?.[0];
  const premises = areaNamesFor(service, "premises");
  const homeVisit = areaNamesFor(service, "home_visit");

  // Prefer the mode the offering leads with; "either" shows both lines'
  // worth of information in one string rather than guessing.
  //
  // Area names are interpolated through t()'s ICU params so the message
  // catalogue controls word order (required for en/ar phrasing parity).
  const locationParts: string[] = [];
  if (premises.length > 0) {
    locationParts.push(t("atPremisesIn", { areas: premises.join(", ") }));
  }
  if (homeVisit.length > 0) {
    locationParts.push(t("homeVisitIn", { areas: homeVisit.join(", ") }));
  }

  return (
    <Link
      href={`/${locale}/service/${service.slug}`}
      className="group block"
      aria-label={service.name}
    >
      <div className="relative aspect-[4/5] overflow-hidden bg-nl-russet/15 mb-4">
        {image ? (
          <Image
            src={image}
            alt={service.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 360px"
            quality={92}
            loading="lazy"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-[10px] uppercase tracking-[0.2em] text-nl-russet">
            {t("noImage")}
          </div>
        )}
      </div>

      <p className="text-[9.5px] tracking-[0.22em] uppercase text-nl-russet mb-1.5 truncate">
        {service.vendor_name || service.category_name}
      </p>

      <h3 className="font-serif text-lg leading-tight text-nl-cacao line-clamp-2 mb-2.5 min-h-[44px]">
        {service.name}
      </h3>

      <div className="h-px w-7 bg-nl-amber mb-2.5" />

      {locationParts.length > 0 && (
        <p
          data-testid="service-location"
          className="text-[11px] text-nl-russet mb-2 line-clamp-2"
        >
          {locationParts.join(" · ")}
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[9.5px] tracking-[0.2em] uppercase text-nl-russet">
            {currency}
          </span>
          <span className="font-serif text-xl text-nl-cacao leading-none">
            {formatAmount(service.price_fils, locale)}
          </span>
          <span className="ms-2 text-[11px] text-nl-russet">
            {t("duration", { minutes: service.duration_minutes })}
          </span>
        </div>
        <span className="inline-flex items-center min-h-[44px] px-4 border border-nl-cacao/80 text-nl-cacao text-[9.5px] tracking-[0.22em] uppercase group-hover:bg-nl-cacao group-hover:text-nl-linen transition-colors shrink-0">
          {t("book")}
        </span>
      </div>
    </Link>
  );
}
