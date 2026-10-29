"use client";

import Image from "next/image";
import Link from "next/link";
import { useLocale } from "next-intl";
import { usePreferencesStore } from "@/stores/preferences";
import { formatPrice } from "@/lib/utils";

interface RitualProduct {
  id: string;
  name: string;
  slug: string;
  price: number;
  image_url?: string;
  step_label?: string;
}

interface CompleteRitualProps {
  products: RitualProduct[];
  title?: string;
}

export function CompleteRitual({ products, title = "Complete Your Ritual" }: CompleteRitualProps) {
  const locale = useLocale();
  const { currency } = usePreferencesStore();

  if (products.length === 0) return null;

  return (
    <section className="py-12 md:py-16">
      <div className="container">
        <h2 className="text-2xl md:text-3xl font-serif font-bold text-center mb-8">
          {title}
        </h2>

        <div className="flex items-center gap-3 overflow-x-auto scrollbar-hide pb-2 justify-start md:justify-center">
          {products.map((product, i) => (
            <div key={product.id} className="flex items-center gap-3 shrink-0">
              <Link
                href={`/${locale}/product/${product.slug}`}
                className="flex flex-col items-center gap-2 w-36 group"
              >
                <div className="relative w-28 h-28 rounded-xl overflow-hidden bg-warm border border-border group-hover:border-copper transition">
                  {product.image_url ? (
                    <Image src={product.image_url} alt={product.name} fill className="object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
                      No image
                    </div>
                  )}
                </div>
                {product.step_label && (
                  <span className="text-xs text-copper font-medium uppercase tracking-wide">
                    {product.step_label}
                  </span>
                )}
                <span className="text-xs font-medium text-center line-clamp-2">{product.name}</span>
                <span className="text-xs text-muted-foreground">
                  {formatPrice(product.price, currency)}
                </span>
              </Link>

              {i < products.length - 1 && (
                <div className="hidden md:flex flex-col items-center gap-1 shrink-0">
                  <div className="w-1.5 h-1.5 rounded-full bg-copper" />
                  <div className="w-px h-4 bg-border" />
                  <div className="w-1.5 h-1.5 rounded-full bg-copper" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
