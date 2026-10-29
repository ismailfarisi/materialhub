"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ScrollRail } from "@/components/layout/scroll-rail";
import { usePreferencesStore } from "@/stores/preferences";

interface FlashDeal {
  id: string;
  product: {
    id: string;
    title: string;
    slug: string;
    price: number;
    image_url: string;
    vendor_name?: string;
  };
  deal_price: number;
  expires_at: string;
  /** null means the deal has no unit cap — see flash_deals.quantity_limit. */
  quantity_limit: number | null;
  quantity_sold: number;
}

function formatAmount(amountInFils: number, locale: string): string {
  return new Intl.NumberFormat(locale === "en" ? "en-US" : locale, {
    maximumFractionDigits: 0,
  }).format(amountInFils / 100);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Each deal expires on its own clock, so the countdown belongs to the card.
 * Renders nothing until the client has ticked once — the server has no clock
 * to agree with.
 */
function DealCountdown({ expiresAt }: { expiresAt: string }) {
  const [timeLeft, setTimeLeft] = useState<{
    h: number;
    m: number;
    s: number;
    expired: boolean;
  } | null>(null);

  useEffect(() => {
    function update() {
      const diff = new Date(expiresAt).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft({ h: 0, m: 0, s: 0, expired: true });
        return;
      }
      setTimeLeft({
        h: Math.floor(diff / 3600000),
        m: Math.floor((diff % 3600000) / 60000),
        s: Math.floor((diff % 60000) / 1000),
        expired: false,
      });
    }
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  if (!timeLeft) return null;

  return (
    <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-nl-espresso/85 backdrop-blur-sm px-3 py-2">
      <span className="text-[8.5px] tracking-[0.22em] uppercase text-nl-pearl/60">
        {timeLeft.expired ? "Deal" : "Ends in"}
      </span>
      <span
        className={`font-serif text-sm leading-none tabular-nums ${
          timeLeft.expired ? "text-nl-amber" : "text-nl-linen"
        }`}
      >
        {timeLeft.expired
          ? "Ended"
          : `${pad(timeLeft.h)}:${pad(timeLeft.m)}:${pad(timeLeft.s)}`}
      </span>
    </div>
  );
}

/** Below this many units, scarcity is worth saying out loud. */
const SCARCITY_THRESHOLD = 6;

export function FlashDeals({ deals }: { deals: FlashDeal[] }) {
  const t = useTranslations("home");
  const tc = useTranslations("common");
  const locale = useLocale();
  const { currency } = usePreferencesStore();

  if (!deals.length) return null;

  // Italicize the last word in amber — the design's signature section accent.
  const words = t("flashDeals").split(/\s+/);
  const head = words.length > 1 ? words.slice(0, -1).join(" ") : "";
  const accent = words.length > 1 ? words[words.length - 1] : words[0];

  return (
    <section
      data-section="flash-deals"
      className="relative left-[calc(50%-50vw)] w-screen bg-nl-espresso py-12 text-nl-linen rtl:left-auto rtl:right-[calc(50%-50vw)] md:py-[72px]"
    >
      <div className="max-w-[1400px] mx-auto px-4 md:px-12">
        <div className="mb-8 md:mb-10 max-w-[540px]">
          <p className="text-[11px] uppercase tracking-[0.22em] text-nl-amber">
            Limited release
          </p>
          <h2 className="font-serif text-3xl md:text-5xl leading-[1.05] tracking-tight mt-2 md:mt-3">
            {head && <>{head} </>}
            <span className="italic text-nl-amber">{accent}</span>
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-nl-pearl/70">
            Each price holds until its own clock runs out.
          </p>
        </div>
      </div>

      <ScrollRail className="flex gap-4 md:gap-[18px] overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-2 px-4 md:px-12 scroll-ps-4 md:scroll-ps-12 max-w-[1400px] mx-auto">
        {deals.map((deal) => {
          const discount = Math.round(
            ((deal.product.price - deal.deal_price) / deal.product.price) * 100,
          );
          // An uncapped deal (quantity_limit null) has nothing to run out of,
          // so it can be neither scarce nor sold out.
          const limit =
            typeof deal.quantity_limit === "number" && deal.quantity_limit > 0
              ? deal.quantity_limit
              : null;
          const remaining =
            limit === null ? null : Math.max(limit - deal.quantity_sold, 0);
          const soldPercent =
            limit === null
              ? 0
              : Math.min(Math.round((deal.quantity_sold / limit) * 100), 100);
          const soldOut = remaining === 0;
          // Abundance isn't news. Only speak up once the shelf is nearly bare.
          const showScarcity =
            remaining !== null && remaining > 0 && remaining < SCARCITY_THRESHOLD;

          return (
            <Link
              key={deal.id}
              href={`/${locale}/product/${deal.product.slug}`}
              className="flex-none w-[200px] md:w-[236px] snap-start group block"
              aria-label={deal.product.title}
            >
              <div className="relative aspect-[4/5] overflow-hidden bg-nl-linen/10 mb-4">
                {deal.product.image_url && (
                  <Image
                    src={deal.product.image_url}
                    alt={deal.product.title}
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                    sizes="(max-width: 768px) 200px, 236px"
                  />
                )}
                {!soldOut && (
                  <>
                    <div className="absolute top-3 left-3 bg-nl-amber text-nl-espresso text-[9px] tracking-[0.22em] uppercase px-2.5 py-1">
                      −{discount}%
                    </div>
                    <DealCountdown expiresAt={deal.expires_at} />
                  </>
                )}

                {soldOut && (
                  <div className="absolute inset-0 bg-nl-cacao/40 flex items-center justify-center">
                    <span className="text-nl-linen text-[10px] tracking-[0.22em] uppercase bg-nl-cacao/70 px-3 py-1.5">
                      {tc("outOfStock")}
                    </span>
                  </div>
                )}
              </div>

              {deal.product.vendor_name && (
                <p className="text-[9px] tracking-[0.22em] uppercase text-nl-amber mb-2 truncate">
                  {deal.product.vendor_name}
                </p>
              )}
              <h3 className="font-serif text-lg leading-tight text-nl-linen line-clamp-2 mb-2.5 min-h-[44px]">
                {deal.product.title}
              </h3>

              <div className="h-px w-7 bg-nl-amber mb-2.5" />

              <div className="flex items-baseline gap-1.5 flex-wrap">
                <span className="text-[9.5px] tracking-[0.2em] uppercase text-nl-pearl/60">
                  {currency}
                </span>
                <span className="font-serif text-xl text-nl-linen leading-none">
                  {formatAmount(deal.deal_price, locale)}
                </span>
                <span className="text-[10px] text-nl-pearl/45 line-through">
                  {formatAmount(deal.product.price, locale)}
                </span>
              </div>

              {showScarcity && (
                <div className="mt-4">
                  <div className="h-[2px] bg-nl-linen/15 overflow-hidden">
                    <div
                      className="h-full bg-nl-amber transition-all"
                      style={{ width: `${soldPercent}%` }}
                    />
                  </div>
                  <p className="mt-2 text-[9px] tracking-[0.22em] uppercase text-nl-amber">
                    Only {remaining} left
                  </p>
                </div>
              )}
            </Link>
          );
        })}
      </ScrollRail>
    </section>
  );
}
