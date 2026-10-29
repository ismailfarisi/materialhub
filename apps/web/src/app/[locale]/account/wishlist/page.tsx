"use client";

import { useTranslations } from "next-intl";
import { useWishlist, useRemoveFromWishlist } from "@/lib/queries/account";
import { ProductCard } from "@/components/product/product-card";
import { X } from "lucide-react";
import {
  Eyebrow,
  SerifTitle,
  MAISON_SERIF,
} from "@/components/checkout/maison-primitives";

export default function WishlistPage() {
  const t = useTranslations("account");
  const tCommon = useTranslations("common");
  const { data: wishlist, isLoading } = useWishlist();
  const removeItem = useRemoveFromWishlist();

  if (isLoading) {
    return (
      <div>
        <div className="mb-5">
          <Eyebrow>WISHLIST</Eyebrow>
          <SerifTitle size={26} className="mt-1.5">
            {t("wishlist")}
          </SerifTitle>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div
                className="aspect-square animate-pulse"
                style={{ background: "rgba(44,24,16,0.07)" }}
              />
              <div
                className="h-3.5 w-3/4 animate-pulse"
                style={{ background: "rgba(44,24,16,0.07)" }}
              />
              <div
                className="h-3.5 w-1/2 animate-pulse"
                style={{ background: "rgba(44,24,16,0.07)" }}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const items = wishlist || [];

  return (
    <div>
      <div className="mb-5">
        <Eyebrow>WISHLIST</Eyebrow>
        <SerifTitle size={26} className="mt-1.5">
          {t("wishlist")}
        </SerifTitle>
      </div>
      {items.length === 0 ? (
        <div
          className="py-12 text-center"
          style={{
            fontFamily: MAISON_SERIF,
            fontStyle: "italic",
            fontSize: 16,
            color: "hsl(var(--nl-russet))",
          }}
        >
          {tCommon("noResults")}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
          {items.map((item: any) => (
            <div key={item.product_id} className="relative">
              <ProductCard product={item} showWishlist={false} />
              <button
                onClick={() => removeItem.mutate(item.product_id)}
                className="absolute top-2 end-2 p-1 transition-colors"
                style={{
                  background: "rgba(247,243,237,0.85)",
                  border: "1px solid rgba(44,24,16,0.16)",
                  color: "hsl(var(--nl-cacao))",
                }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
