"use client";

import { filsToAed, formatAed } from "@/lib/money";
import type { CheckoutQuote } from "@/lib/queries/checkout-quote";
import { formatPrice } from "@/lib/utils";
import { useCheckoutStore } from "@/stores/checkout";
import { ArrowRight, Loader2, RotateCcw, ShieldCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Image from "next/image";
import { MAISON_SANS, MAISON_SERIF, MaisonMark } from "./maison-primitives";

interface OrderSummarySidebarProps {
  items: any[];
  quote: CheckoutQuote | null;
  canOrder: boolean;
  onPlaceOrder: () => void;
}

export function OrderSummarySidebar({
  items,
  quote,
  canOrder,
  onPlaceOrder,
}: OrderSummarySidebarProps) {
  const t = useTranslations("checkout");
  const tCart = useTranslations("cart");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const { isPlacing, paymentMethod } = useCheckoutStore();

  const selectedSurchargeFils =
    quote?.payment_methods.find((m) => m.id === paymentMethod)?.surcharge_fils ?? 0;
  const displayGrandTotalFils = (quote?.totals.grand_total_fils ?? 0) + selectedSurchargeFils;

  const pieceCount = items.reduce((sum: number, item: any) => sum + item.quantity, 0);
  const piecesLabel =
    pieceCount === 1
      ? tCart("yourEditOne", { count: pieceCount })
      : tCart("yourEditOther", { count: pieceCount });

  return (
    <aside
      className="hidden lg:flex flex-col"
      style={{
        background: "hsl(var(--nl-pearl))",
        borderLeft: "1px solid rgba(44,24,16,0.08)",
        minHeight: "calc(100vh - 162px)",
      }}
    >
      <div style={{ padding: "32px 40px 16px" }}>
        <div className="flex items-center" style={{ gap: 10 }}>
          <MaisonMark size={11} />
          <span
            className="uppercase"
            style={{
              fontSize: 10,
              letterSpacing: "0.28em",
              color: "hsl(var(--nl-amber-text))",
              fontFamily: MAISON_SANS,
            }}
          >
            {piecesLabel}
          </span>
        </div>
        <div
          style={{
            fontFamily: MAISON_SERIF,
            fontSize: 28,
            lineHeight: 1.05,
            letterSpacing: "-0.01em",
            marginTop: 8,
            color: "hsl(var(--nl-cacao))",
          }}
        >
          {tCart("the")}{" "}
          <span
            style={{
              fontStyle: "italic",
              color: "hsl(var(--nl-amber-text))",
            }}
          >
            {tCart("bag")}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto" style={{ padding: "0 40px" }}>
        {items.map((item: any) => (
          <div
            key={item.variant_id}
            className="grid items-center"
            style={{
              gridTemplateColumns: "70px 1fr auto",
              gap: 16,
              padding: "16px 0",
              borderTop: "1px solid rgba(44,24,16,0.08)",
            }}
          >
            {/* The quantity badge sits outside the thumbnail box, so the
                clipping lives on an inner wrapper — not this container. */}
            <div className="relative" style={{ aspectRatio: "1 / 1" }}>
              <div
                className="absolute inset-0 overflow-hidden"
                style={{
                  background: "hsl(var(--nl-linen))",
                  border: "1px solid rgba(44,24,16,0.08)",
                }}
              >
                <Image
                  src={item.image_url}
                  alt={item.product_title}
                  fill
                  sizes="70px"
                  className="object-cover"
                />
              </div>
              <span
                className="absolute flex items-center justify-center"
                style={{
                  top: -6,
                  right: -6,
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  background: "hsl(var(--nl-amber))",
                  color: "hsl(var(--nl-espresso))",
                  fontSize: 10,
                  fontFamily: MAISON_SANS,
                }}
              >
                {item.quantity}
              </span>
            </div>
            <div className="min-w-0">
              {item.vendor_name && (
                <div
                  className="uppercase truncate"
                  style={{
                    fontSize: 9,
                    letterSpacing: "0.22em",
                    color: "hsl(var(--nl-amber-text))",
                  }}
                >
                  {item.vendor_name}
                </div>
              )}
              <div
                className="truncate"
                style={{
                  fontFamily: MAISON_SERIF,
                  fontSize: 14.5,
                  marginTop: 2,
                  color: "hsl(var(--nl-cacao))",
                }}
              >
                {item.product_title}
              </div>
              {item.variant_label && (
                <div
                  className="truncate"
                  style={{
                    fontFamily: MAISON_SERIF,
                    fontStyle: "italic",
                    fontSize: 11,
                    color: "hsl(var(--nl-russet))",
                  }}
                >
                  {item.variant_label}
                </div>
              )}
            </div>
            <div
              style={{
                fontFamily: MAISON_SERIF,
                fontSize: 15,
                color: "hsl(var(--nl-cacao))",
              }}
            >
              {formatPrice(item.current_price * item.quantity, "AED", locale)}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          padding: "20px 40px 26px",
          borderTop: "1px solid rgba(44,24,16,0.12)",
        }}
      >
        {quote === null ? (
          <div className="grid mb-3.5" style={{ gap: 6 }}>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex justify-between">
                <div
                  className="h-4 w-24 animate-pulse"
                  style={{ background: "rgba(44,24,16,0.1)" }}
                />
                <div
                  className="h-4 w-16 animate-pulse"
                  style={{ background: "rgba(44,24,16,0.1)" }}
                />
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="grid" style={{ gap: 6, fontSize: 12.5, marginBottom: 14 }}>
              <Row label={tCart("subtotal")} value={formatAed(quote.totals.subtotal_fils)} />
              <Row
                label={tCart("shipping")}
                value={
                  quote.totals.shipping_fils === 0
                    ? t("complimentary")
                    : formatAed(quote.totals.shipping_fils)
                }
                muted
                accent={quote.totals.shipping_fils === 0}
              />
              {quote.totals.discount_fils > 0 && (
                <Row
                  label={tCommon("discount")}
                  value={`-${formatAed(quote.totals.discount_fils)}`}
                  accent
                />
              )}
              {selectedSurchargeFils > 0 && (
                <Row
                  label={t("payment.cod.surcharge", {
                    amount: filsToAed(selectedSurchargeFils),
                  })}
                  value={formatAed(selectedSurchargeFils)}
                  muted
                />
              )}
              <Row label={t("vatIncluded")} value={t("included")} muted />
            </div>

            <div
              style={{
                height: 1,
                background: "rgba(44,24,16,0.12)",
                margin: "0 0 14px",
              }}
            />

            <div className="flex items-baseline justify-between" style={{ marginBottom: 16 }}>
              <span
                className="uppercase"
                style={{
                  fontSize: 10,
                  letterSpacing: "0.24em",
                  color: "hsl(var(--nl-russet))",
                  fontFamily: MAISON_SANS,
                }}
              >
                {t("totalDue")}
              </span>
              <span
                style={{
                  fontFamily: MAISON_SERIF,
                  fontSize: 32,
                  letterSpacing: "-0.01em",
                  color: "hsl(var(--nl-cacao))",
                }}
              >
                {formatAed(displayGrandTotalFils)}
              </span>
            </div>
          </>
        )}

        <button
          type="button"
          onClick={onPlaceOrder}
          disabled={!canOrder || isPlacing}
          className="w-full flex items-center justify-center uppercase transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            background: "hsl(var(--nl-cacao))",
            color: "hsl(var(--nl-linen))",
            padding: "18px 0",
            gap: 14,
            fontSize: 11,
            letterSpacing: "0.28em",
            fontFamily: MAISON_SANS,
            border: "none",
          }}
        >
          {isPlacing ? (
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
          ) : (
            <>
              {t("placeOrder")}
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
            </>
          )}
        </button>

        <div
          className="flex items-center justify-center uppercase"
          style={{
            gap: 14,
            marginTop: 14,
            fontSize: 9.5,
            letterSpacing: "0.22em",
            color: "hsl(var(--nl-russet))",
            fontFamily: MAISON_SANS,
          }}
        >
          <span className="inline-flex items-center" style={{ gap: 5 }}>
            <ShieldCheck className="h-3 w-3" strokeWidth={1.5} />
            {t("secure")}
          </span>
          <span>·</span>
          <span className="inline-flex items-center" style={{ gap: 5 }}>
            <RotateCcw className="h-3 w-3" strokeWidth={1.5} />
            {t("returnsPolicy")}
          </span>
        </div>
      </div>
    </aside>
  );
}

function Row({
  label,
  value,
  muted,
  accent,
}: {
  label: string;
  value: string;
  muted?: boolean;
  accent?: boolean;
}) {
  return (
    <div
      className="flex justify-between"
      style={{
        color: accent
          ? "hsl(var(--nl-amber-text))"
          : muted
            ? "hsl(var(--nl-russet))"
            : "hsl(var(--nl-cacao))",
      }}
    >
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
