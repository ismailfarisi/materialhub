"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { usePreferencesStore } from "@/stores/preferences";
import { formatPrice } from "@/lib/utils";

interface StickyBottomBarProps {
  visible: boolean;
  product: any;
  onAddToCart: () => void;
  isPending: boolean;
  /** Product-level out of stock — disables the quick-add. */
  outOfStock?: boolean;
}

export function StickyBottomBar({ visible, product, onAddToCart, isPending, outOfStock = false }: StickyBottomBarProps) {
  const tCommon = useTranslations("common");
  const { currency } = usePreferencesStore();

  if (!visible) return null;

  return (
    <div className="fixed bottom-[calc(3.5rem+env(safe-area-inset-bottom))] left-0 right-0 z-50 md:hidden animate-slide-up">
      <div className="bg-card/80 backdrop-blur-lg border-t border-border px-4 py-3 flex items-center gap-3">
        {product.images?.[0]?.url && (
          <div className="relative h-10 w-10 rounded-lg overflow-hidden shrink-0">
            <Image
              src={product.images[0].url}
              alt={product.title}
              fill
              className="object-cover"
            />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{product.title}</p>
          <p className="text-sm font-bold text-foreground">
            {formatPrice(product.price, currency)}
          </p>
        </div>
        <button
          onClick={onAddToCart}
          disabled={isPending || outOfStock}
          aria-disabled={outOfStock}
          className={
            outOfStock
              ? "bg-muted text-muted-foreground px-5 py-2.5 rounded-full text-sm font-medium cursor-not-allowed shrink-0"
              : "bg-copper text-white px-5 py-2.5 rounded-full text-sm font-medium hover:bg-copper/90 disabled:opacity-50 shrink-0 transition"
          }
        >
          {outOfStock ? tCommon("outOfStock") : isPending ? "..." : tCommon("addToCart")}
        </button>
      </div>
    </div>
  );
}
