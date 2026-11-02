"use client";

import { useRemoveCartItem, useUpdateCartItem } from "@/lib/queries/cart";
import { AlertTriangle, Minus, Plus, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";

const SERIF_STACK = "var(--font-display), 'Inter Tight', system-ui, sans-serif";

interface CartItemData {
  variant_id: string;
  product_slug?: string | null;
  product_title: string;
  variant_label?: string | null;
  vendor_name?: string | null;
  image_url: string;
  added_price: number;
  current_price: number;
  is_stale?: boolean;
  quantity: number;
}

export function CartItem({
  item,
  isLast = false,
  onNavigate,
}: {
  item: CartItemData;
  isLast?: boolean;
  /** Called when the shopper follows the product link (e.g. to close the cart slide-over). */
  onNavigate?: () => void;
}) {
  const t = useTranslations("cart");
  const locale = useLocale();
  const updateItem = useUpdateCartItem();
  const removeItem = useRemoveCartItem();
  const isStale = item.is_stale ?? false;
  const lineTotal = item.current_price * item.quantity;
  const productHref = item.product_slug
    ? `/${locale}/product/${item.product_slug}`
    : null;

  return (
    <div
      className="grid gap-[18px] py-[22px]"
      style={{
        gridTemplateColumns: "88px 1fr",
        borderBottom: isLast ? "none" : "1px solid rgba(15,18,24,0.08)",
      }}
    >
      {productHref ? (
        <Link
          href={productHref}
          onClick={onNavigate}
          aria-label={item.product_title}
          className="relative block overflow-hidden bg-nl-pearl"
          style={{ aspectRatio: "1 / 1" }}
        >
          <Image
            src={item.image_url}
            alt={item.product_title}
            fill
            sizes="88px"
            className="object-cover transition-transform duration-300 hover:scale-[1.04]"
          />
        </Link>
      ) : (
        <div className="relative overflow-hidden bg-nl-pearl" style={{ aspectRatio: "1 / 1" }}>
          <Image
            src={item.image_url}
            alt={item.product_title}
            fill
            sizes="88px"
            className="object-cover"
          />
        </div>
      )}
      <div className="flex flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {item.vendor_name && (
              <div
                className="uppercase truncate"
                style={{
                  fontSize: 9,
                  letterSpacing: "0.22em",
                  color: "hsl(var(--nl-russet))",
                  marginBottom: 4,
                }}
              >
                {item.vendor_name}
              </div>
            )}
            {productHref ? (
              <Link
                href={productHref}
                onClick={onNavigate}
                className="block transition-opacity hover:opacity-70"
                style={{
                  fontFamily: SERIF_STACK,
                  fontSize: 17,
                  lineHeight: 1.2,
                  fontWeight: 400,
                }}
              >
                {item.product_title}
              </Link>
            ) : (
              <div
                style={{
                  fontFamily: SERIF_STACK,
                  fontSize: 17,
                  lineHeight: 1.2,
                  fontWeight: 400,
                }}
              >
                {item.product_title}
              </div>
            )}
            {item.variant_label && (
              <div
                style={{
                  fontFamily: SERIF_STACK,
                  fontStyle: "italic",
                  fontSize: 12,
                  color: "hsl(var(--nl-russet))",
                  marginTop: 4,
                }}
              >
                {item.variant_label}
              </div>
            )}
            {isStale && (
              <div
                className="flex items-center gap-1 mt-1.5"
                style={{ fontSize: 10.5, color: "hsl(var(--destructive))" }}
              >
                <AlertTriangle className="h-3 w-3" strokeWidth={1.5} />
                {t("stalePriceWarning")}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => removeItem.mutate(item.variant_id)}
            disabled={removeItem.isPending}
            aria-label={t("remove")}
            className="p-1 transition-opacity hover:opacity-100 disabled:opacity-30"
            style={{ opacity: 0.5, color: "hsl(var(--nl-cacao))" }}
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.25} />
          </button>
        </div>
        <div className="mt-auto pt-3 flex items-center justify-between">
          <div className="flex items-center" style={{ border: "1px solid rgba(15,18,24,0.16)" }}>
            <button
              type="button"
              onClick={() =>
                updateItem.mutate({
                  variantId: item.variant_id,
                  quantity: Math.max(1, item.quantity - 1),
                })
              }
              disabled={item.quantity <= 1 || updateItem.isPending}
              aria-label={t("decrease")}
              className="grid place-items-center transition-colors hover:bg-black/5 disabled:opacity-30 disabled:hover:bg-transparent"
              style={{
                width: 28,
                height: 28,
                color: "hsl(var(--nl-cacao))",
              }}
            >
              <Minus className="h-3 w-3" strokeWidth={1.25} />
            </button>
            <span
              className="text-center"
              style={{
                fontFamily: SERIF_STACK,
                width: 24,
                fontSize: 12,
              }}
            >
              {item.quantity}
            </span>
            <button
              type="button"
              onClick={() =>
                updateItem.mutate({
                  variantId: item.variant_id,
                  quantity: item.quantity + 1,
                })
              }
              disabled={updateItem.isPending}
              aria-label={t("increase")}
              className="grid place-items-center transition-colors hover:bg-black/5 disabled:opacity-30 disabled:hover:bg-transparent"
              style={{
                width: 28,
                height: 28,
                color: "hsl(var(--nl-cacao))",
              }}
            >
              <Plus className="h-3 w-3" strokeWidth={1.25} />
            </button>
          </div>
          <div className="text-right">
            <span
              className="uppercase mr-1.5"
              style={{
                fontSize: 9,
                letterSpacing: "0.22em",
                color: "hsl(var(--nl-russet))",
              }}
            >
              AED
            </span>
            <span
              style={{
                fontFamily: SERIF_STACK,
                fontSize: 18,
              }}
            >
              {(lineTotal / 100).toLocaleString(locale === "en" ? "en-AE" : locale, {
                minimumFractionDigits: 0,
                maximumFractionDigits: 2,
              })}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
