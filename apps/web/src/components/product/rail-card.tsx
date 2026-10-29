"use client";

import type { RailProduct } from "@/lib/queries/recommendations";
import { cn, formatPrice } from "@/lib/utils";
import Image from "next/image";
import Link from "next/link";

interface RailCardProps {
  item: RailProduct;
  /** Set to true on the bestsellers rail for the currently-viewed product. */
  isViewing?: boolean;
  /** Override the eyebrow line — defaults to vendor/brand name. */
  eyebrow?: string;
  /** Set on dark-mode rails so text contrasts. */
  dark?: boolean;
  /** Optional locale prefix for the product link. */
  localePrefix?: string;
}

export function RailCard({ item, isViewing, eyebrow, dark, localePrefix = "" }: RailCardProps) {
  const image = item.images?.[0];
  const eyebrowText =
    eyebrow ?? item.brand?.name ?? item.vendor?.business_name ?? item.vendor?.name ?? null;

  const href = `${localePrefix}/product/${item.slug}`;

  const cardText = dark ? "text-nl-linen" : "text-nl-cacao";
  const eyebrowColor = dark ? "text-nl-amber" : "text-nl-russet";
  const priceColor = dark ? "text-nl-pearl" : "text-nl-russet";

  return (
    <Link href={href} className="flex-shrink-0 w-[252px] block group" aria-label={item.name}>
      <div className="relative aspect-[4/5] overflow-hidden mb-4 bg-nl-russet/30">
        {image?.url ? (
          <Image
            src={image.url}
            alt={image.alt_text ?? item.name}
            fill
            sizes="252px"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
          />
        ) : null}
        {isViewing && (
          <div className="absolute top-3 left-3 px-2.5 py-1 bg-nl-amber text-nl-espresso text-[9px] tracking-[0.22em] uppercase">
            You&apos;re viewing
          </div>
        )}
      </div>

      {eyebrowText && (
        <div className={cn("text-[9px] tracking-[0.22em] uppercase mb-2", eyebrowColor)}>
          {eyebrowText}
        </div>
      )}
      <div className={cn("font-serif text-xl leading-tight mb-2", cardText)}>{item.name}</div>
      <div className="h-px w-7 bg-nl-amber mb-2.5" />
      <div className={cn("text-xs tracking-wider", priceColor)}>
        {formatPrice(item.price, "AED")}
      </div>
    </Link>
  );
}
