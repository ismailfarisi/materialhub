"use client";

import { ShoppingBag, X } from "lucide-react";
import { useAddToCart } from "@/lib/queries/cart";
import { useCartStore } from "@/stores/cart";

interface Product {
  id: string;
  slug?: string;
  name: string;
  priceFils: number;
  imageUrl: string;
  inStock?: boolean;
}

interface Props {
  product: Product | null;
  open: boolean;
  onClose: () => void;
  locale: string;
}

export function ProductDrawer({ product, open, onClose, locale }: Props) {
  const addToCart = useAddToCart();
  const openSlideOver = useCartStore((s) => s.openSlideOver);

  if (!open || !product) return null;

  const priceAed = (product.priceFils / 100).toLocaleString("en-AE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const productHref = product.slug
    ? `/${locale}/product/${product.slug}`
    : `/${locale}/product/${product.id}`;
  const isOutOfStock = product.inStock === false;

  function handleAddToCart() {
    if (!product || isOutOfStock) return;
    addToCart.mutate(
      {
        productId: product.id,
        // Reel tags do not capture a variant today — backend defaults to
        // the product's default variant.
        variantId: null,
        quantity: 1,
      },
      {
        onSuccess: () => {
          openSlideOver();
          onClose();
        },
        onError: (err) => {
          console.error("[reels] add to cart failed", err);
        },
      },
    );
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in" />
      <div
        className="relative w-full max-w-md rounded-t-3xl bg-white shadow-2xl animate-in slide-in-from-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <span className="h-1.5 w-10 rounded-full bg-gray-300" />
        </div>
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200"
          aria-label="Close"
        >
          <X className="h-4 w-4" strokeWidth={2.5} />
        </button>

        <div className="px-5 pb-5 pt-3">
          <div className="flex gap-4">
            <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-gray-100">
              {product.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={product.imageUrl}
                  alt={product.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-gray-400">
                  <ShoppingBag className="h-8 w-8" strokeWidth={1.5} />
                </div>
              )}
            </div>
            <div className="flex flex-1 flex-col justify-between min-w-0">
              <h2 className="text-base font-semibold text-gray-900 line-clamp-2">
                {product.name}
              </h2>
              <div>
                <div className="text-2xl font-bold text-gray-900">
                  AED <span className="tabular-nums">{priceAed}</span>
                </div>
                {isOutOfStock ? (
                  <div className="mt-0.5 text-xs font-medium text-red-600">
                    Out of stock
                  </div>
                ) : (
                  <div className="mt-0.5 text-xs text-emerald-600">
                    In stock · ready to ship
                  </div>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleAddToCart}
            disabled={addToCart.isPending || isOutOfStock}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground shadow-md transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:hover:bg-primary"
          >
            <ShoppingBag className="h-4 w-4" strokeWidth={2.5} />
            {addToCart.isPending ? "Adding..." : isOutOfStock ? "Unavailable" : "Add to cart"}
          </button>
          <a
            href={productHref}
            className="mt-3 block text-center text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            View full details →
          </a>
        </div>
      </div>
    </div>
  );
}
