"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { VariantSelector } from "@/components/product/variant-selector";
import { useChannelEvents } from "@/lib/channels/use-channel-events";
import { useAddToCart } from "@/lib/queries/cart";
import { useToggleWishlist, useWishlist } from "@/lib/queries/account";
import { useCartStore } from "@/stores/cart";
import { usePreferencesStore } from "@/stores/preferences";
import { formatPrice, cn } from "@/lib/utils";
import { Minus, Plus, Heart, Share2, Truck, Star } from "lucide-react";

interface PurchasePanelProps {
  product: any;
  reviewCount?: number;
  onScrollToReviews?: () => void;
}

export function PurchasePanel({ product, reviewCount = 0, onScrollToReviews }: PurchasePanelProps) {
  const t = useTranslations("product");
  const tCommon = useTranslations("common");
  const tAccount = useTranslations("account");
  const { currency } = usePreferencesStore();
  const { openSlideOver } = useCartStore();
  const addToCart = useAddToCart();
  const { fire } = useChannelEvents();

  const toggleWishlist = useToggleWishlist();
  const { data: wishlistItems } = useWishlist();

  const isWishlisted = (wishlistItems || []).some(
    (item: any) => item.product_id === product.id
  );

  const [selectedAttrs, setSelectedAttrs] = useState<Record<string, string>>({});
  const [quantity, setQuantity] = useState(1);

  const selectedVariant = product.variants?.find((v: any) =>
    Object.entries(selectedAttrs).every(
      ([key, value]) => v.attributes?.[key] === value
    )
  );

  // Flash deal (when active) beats compare_at_price for the displayed price.
  // The backend only attaches product.flash_deal when the deal is active, so
  // its presence is enough — no expiry check needed here.
  const dealPrice = product.flash_deal?.deal_price ?? null;
  const dealOriginalPrice = product.flash_deal?.original_price ?? null;

  const variantPrice = selectedVariant?.price ?? product.price;
  const displayPrice = dealPrice ?? variantPrice;
  const strikePrice = dealPrice
    ? dealOriginalPrice
    : product.compare_at_price && product.compare_at_price > variantPrice
      ? product.compare_at_price
      : null;

  const isAvailable = selectedVariant
    ? selectedVariant.quantity_available > 0
    : product.quantity_available > 0;

  const discountPercent =
    strikePrice && strikePrice > displayPrice
      ? Math.round(((strikePrice - displayPrice) / strikePrice) * 100)
      : 0;

  function handleAddToCart() {
    if (!selectedVariant && product.variants?.length > 0) return;
    addToCart.mutate(
      {
        productId: product.id,
        variantId: selectedVariant?.id || null,
        quantity,
      },
      {
        onSuccess: () => {
          fire("AddToCart", {
            product_id: product.id,
            variant_id: selectedVariant?.id,
            product_name: product.title,
            brand: product.brand_name,
            currency: "AED",
            value_fils: (selectedVariant?.price ?? product.price) * quantity,
            quantity,
          });
          openSlideOver();
        },
      }
    );
  }

  return (
    <div className="space-y-5">
      {/* Brand */}
      {product.brand_name && (
        <p className="text-sm font-medium tracking-widest uppercase text-copper">
          {product.brand_name}
        </p>
      )}

      {/* Title */}
      <h1 className="text-2xl md:text-3xl font-serif font-bold text-foreground">
        {product.title}
      </h1>

      {/* Rating strip */}
      {product.rating_avg > 0 && (
        <div className="flex items-center gap-2">
          <div className="flex">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                className={cn(
                  "h-4 w-4",
                  i < Math.round(product.rating_avg)
                    ? "fill-copper text-copper"
                    : "text-border"
                )}
              />
            ))}
          </div>
          <span className="text-sm text-muted-foreground">
            {product.rating_avg.toFixed(1)}
          </span>
          <button
            onClick={onScrollToReviews}
            className="text-sm text-copper hover:underline"
          >
            {tAccount("reviews", { count: reviewCount })}
          </button>
        </div>
      )}

      {/* Mood/Occasion tags */}
      {product.mood_tags && product.mood_tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {product.mood_tags.map((tag: string) => (
            <span
              key={tag}
              className="px-3 py-1 text-xs font-medium rounded-full bg-warm text-copper border border-copper/20"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Price */}
      <div className="flex items-baseline gap-3">
        <span className="text-2xl font-bold text-foreground">
          {formatPrice(displayPrice, currency)}
        </span>
        {strikePrice && discountPercent > 0 && (
          <>
            <span className="text-base text-muted-foreground line-through">
              {formatPrice(strikePrice, currency)}
            </span>
            <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-copper/10 text-copper">
              -{discountPercent}%
            </span>
          </>
        )}
      </div>
      {dealPrice && product.flash_deal?.expires_at && (
        <p className="text-xs text-copper">
          Flash deal ends {new Date(product.flash_deal.expires_at).toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      )}

      {/* Variants */}
      {product.variant_attributes && (
        <VariantSelector
          attributes={product.variant_attributes}
          selected={selectedAttrs}
          onSelect={(attr, val) =>
            setSelectedAttrs((prev) => ({ ...prev, [attr]: val }))
          }
        />
      )}

      {/* Quantity */}
      <div>
        <label className="text-sm font-medium text-foreground">{t("quantity")}</label>
        <div className="flex items-center gap-3 mt-2">
          <button
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            className="p-2 border border-border rounded-full hover:bg-warm transition"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="w-10 text-center font-medium">{quantity}</span>
          <button
            onClick={() => setQuantity((q) => q + 1)}
            className="p-2 border border-border rounded-full hover:bg-warm transition"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Actions */}
      {isAvailable ? (
        <div className="space-y-3">
          <button
            onClick={handleAddToCart}
            disabled={addToCart.isPending}
            className="w-full bg-copper text-white py-3.5 rounded-full font-medium hover:bg-copper/90 disabled:opacity-50 transition animate-pulse-glow"
          >
            {addToCart.isPending ? tCommon("loading") : tCommon("addToCart")}
          </button>
          <button className="w-full border-2 border-copper text-copper py-3.5 rounded-full font-medium hover:bg-copper/5 transition">
            {tCommon("buyNow")}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-destructive font-medium">{t("outOfStock")}</p>
          <button className="w-full border border-border py-3.5 rounded-full text-sm hover:bg-warm transition">
            {tCommon("notifyMe")}
          </button>
        </div>
      )}

      {/* Shipping + Wishlist + Share */}
      <div className="flex items-center gap-4 pt-2 border-t border-border">
        <div className="flex items-center gap-2 text-sm text-muted-foreground flex-1">
          <Truck className="h-4 w-4 text-copper" />
          <span>{tCommon("freeDeliveryUAE")}</span>
        </div>
        <button
          onClick={() => toggleWishlist.mutate(product.id)}
          disabled={toggleWishlist.isPending}
          className="p-2 hover:bg-warm rounded-full transition"
        >
          <Heart
            className={cn(
              "h-5 w-5 transition",
              isWishlisted ? "fill-copper text-copper" : "text-muted-foreground"
            )}
          />
        </button>
        <button className="p-2 hover:bg-warm rounded-full transition">
          <Share2 className="h-5 w-5 text-muted-foreground" />
        </button>
      </div>

      {/* Vendor quick info */}
      {product.vendor_name && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground pt-2 border-t border-border">
          <span>{tCommon("soldBy")}</span>
          <span className="font-medium text-copper hover:underline cursor-pointer">
            {product.vendor_name}
          </span>
        </div>
      )}
    </div>
  );
}
