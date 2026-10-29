"use client";

import { useAddToCart } from "@/lib/queries/cart";
import type { ProductReel } from "@/lib/queries/product-reels";
import { cn, formatPrice } from "@/lib/utils";
import { useCartStore } from "@/stores/cart";
import Image from "next/image";

interface ShopTheLookProps {
  reel: ProductReel;
}

export function ShopTheLook({ reel }: ShopTheLookProps) {
  const addToCart = useAddToCart();
  const { openSlideOver } = useCartStore();

  const tags = (reel.tags ?? []).filter((t) => t.product?.id);
  if (tags.length === 0) return null;

  return (
    <div className="w-full lg:w-[340px] bg-nl-linen text-nl-cacao p-5 lg:p-7 flex flex-col">
      <div className="text-[10px] tracking-[0.22em] uppercase text-nl-russet mb-4">
        Shop the look
      </div>
      <div className="flex flex-col gap-3.5 mb-6">
        {tags.map((tag, i) => {
          const product = tag.product;
          if (!product) return null;
          const image = product.images?.[0];
          return (
            <div
              key={tag.id}
              className={cn(
                "flex items-center gap-3.5 pb-3.5",
                i < tags.length - 1 && "border-b border-nl-cacao/12",
              )}
            >
              <div className="relative w-14 h-[70px] flex-shrink-0 overflow-hidden bg-nl-russet/30">
                {image?.url ? (
                  <Image
                    src={image.url}
                    alt={product.name}
                    fill
                    sizes="56px"
                    className="object-cover"
                  />
                ) : null}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-serif text-base leading-tight">{product.name}</div>
                <div className="text-[11px] text-nl-russet mt-1">
                  {formatPrice(product.price, "AED")}
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  addToCart.mutate(
                    { productId: product.id, variantId: null, quantity: 1 },
                    { onSuccess: () => openSlideOver() },
                  )
                }
                disabled={addToCart.isPending}
                className="px-3 py-2 border border-nl-cacao text-nl-cacao text-[9.5px] tracking-[0.22em] uppercase hover:bg-nl-cacao/5 disabled:opacity-60 transition-colors"
              >
                Add
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-auto pt-5 border-t border-nl-cacao/12">
        <div className="text-[10px] tracking-[0.22em] uppercase text-nl-russet mb-2">
          About {reel.user?.name ?? `@${reel.user?.handle ?? "user"}`}
        </div>
        {reel.user?.creator_tier && (
          <div className="text-xs leading-snug text-nl-cacao mb-3.5">
            {reel.user.creator_tier.charAt(0).toUpperCase() + reel.user.creator_tier.slice(1)}
          </div>
        )}
        <button
          type="button"
          // TODO(future PR): wire to follow mutation when reel author follow is implemented
          className="w-full bg-nl-cacao text-nl-linen border-0 px-3 py-3 text-[10px] tracking-[0.22em] uppercase"
        >
          Follow
        </button>
      </div>
    </div>
  );
}
