"use client";

import { filsToAed, formatAed } from "@/lib/money";
import type { CheckoutQuote } from "@/lib/queries/checkout-quote";
import { formatPrice } from "@/lib/utils";
import { useCheckoutStore } from "@/stores/checkout";
import { ArrowRight, ChevronDown, ChevronUp, Loader2, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Image from "next/image";
import { MAISON_SANS, MAISON_SERIF } from "./maison-primitives";

interface CheckoutBarItem {
  variant_id: string;
  image_url: string;
  product_title: string;
  vendor_name?: string;
  quantity: number;
  current_price: number;
}

interface MobileOrderBarProps {
  items: CheckoutBarItem[];
  quote: CheckoutQuote | null;
  canOrder: boolean;
  onPlaceOrder: () => void;
}

export function MobileOrderBar({ items, quote, canOrder, onPlaceOrder }: MobileOrderBarProps) {
  const t = useTranslations("checkout");
  const tCart = useTranslations("cart");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const { isMobileSummaryOpen, setMobileSummaryOpen, isPlacing, paymentMethod } =
    useCheckoutStore();

  const selectedSurchargeFils =
    quote?.payment_methods.find((m) => m.id === paymentMethod)?.surcharge_fils ?? 0;
  const displayGrandTotalFils = (quote?.totals.grand_total_fils ?? 0) + selectedSurchargeFils;

  return (
    <>
      {isMobileSummaryOpen && (
        <>
          <button
            type="button"
            tabIndex={-1}
            aria-label={t("hideOrderSummary")}
            className="fixed inset-0 z-40 lg:hidden cursor-default"
            style={{ background: "rgba(26, 18, 8, 0.55)" }}
            onClick={() => setMobileSummaryOpen(false)}
          />
          <div
            className="fixed inset-x-0 bottom-0 z-50 lg:hidden overflow-y-auto max-h-[70vh]"
            style={{
              background: "hsl(var(--nl-pearl))",
              color: "hsl(var(--nl-cacao))",
              fontFamily: MAISON_SANS,
              boxShadow: "0 -24px 60px rgba(26,18,8,0.35)",
            }}
          >
            <div
              className="flex items-center justify-between"
              style={{
                padding: "20px 24px",
                borderBottom: "1px solid rgba(15,18,24,0.1)",
              }}
            >
              <div>
                <div
                  className="uppercase"
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.28em",
                    color: "hsl(var(--nl-amber-text))",
                  }}
                >
                  {items.length === 1
                    ? tCart("yourEditOne", { count: items.length })
                    : tCart("yourEditOther", { count: items.length })}
                </div>
                <div
                  style={{
                    fontFamily: MAISON_SERIF,
                    fontSize: 22,
                    lineHeight: 1.1,
                    marginTop: 4,
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
              <button
                type="button"
                onClick={() => setMobileSummaryOpen(false)}
                aria-label={tCart("close")}
                className="grid place-items-center transition-colors hover:bg-black/5"
                style={{
                  width: 32,
                  height: 32,
                  border: "1px solid rgba(15,18,24,0.12)",
                  color: "hsl(var(--nl-cacao))",
                }}
              >
                <X className="h-4 w-4" strokeWidth={1.25} />
              </button>
            </div>

            <div style={{ padding: "8px 24px" }}>
              {items.map((item) => (
                <div
                  key={item.variant_id}
                  className="grid items-center"
                  style={{
                    gridTemplateColumns: "56px 1fr auto",
                    gap: 14,
                    padding: "14px 0",
                    borderTop: "1px solid rgba(15,18,24,0.08)",
                  }}
                >
                  <div
                    className="relative overflow-hidden"
                    style={{
                      aspectRatio: "1 / 1",
                      background: "hsl(var(--nl-linen))",
                    }}
                  >
                    <Image
                      src={item.image_url}
                      alt={item.product_title}
                      fill
                      sizes="56px"
                      className="object-cover"
                    />
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
                        {item.vendor_name} · ×{item.quantity}
                      </div>
                    )}
                    <div
                      className="truncate"
                      style={{
                        fontFamily: MAISON_SERIF,
                        fontSize: 14,
                        marginTop: 2,
                      }}
                    >
                      {item.product_title}
                    </div>
                  </div>
                  <span
                    style={{
                      fontFamily: MAISON_SERIF,
                      fontSize: 14,
                    }}
                  >
                    {formatPrice(item.current_price * item.quantity, "AED", locale)}
                  </span>
                </div>
              ))}
            </div>

            {quote === null ? (
              <div
                className="grid"
                style={{
                  padding: "16px 24px",
                  gap: 6,
                  borderTop: "1px solid rgba(15,18,24,0.1)",
                }}
              >
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex justify-between">
                    <div
                      className="h-4 w-24 animate-pulse"
                      style={{ background: "rgba(15,18,24,0.1)" }}
                    />
                    <div
                      className="h-4 w-16 animate-pulse"
                      style={{ background: "rgba(15,18,24,0.1)" }}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div
                className="grid text-sm"
                style={{
                  padding: "16px 24px",
                  gap: 6,
                  borderTop: "1px solid rgba(15,18,24,0.1)",
                }}
              >
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
                <div
                  style={{
                    height: 1,
                    background: "rgba(15,18,24,0.12)",
                    margin: "6px 0",
                  }}
                />
                <div className="flex items-baseline justify-between">
                  <span
                    className="uppercase"
                    style={{
                      fontSize: 10,
                      letterSpacing: "0.24em",
                      color: "hsl(var(--nl-russet))",
                    }}
                  >
                    {t("totalDue")}
                  </span>
                  <span
                    style={{
                      fontFamily: MAISON_SERIF,
                      fontSize: 24,
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {formatAed(displayGrandTotalFils)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Sticky bottom bar — always visible on mobile */}
      <div
        className="fixed inset-x-0 bottom-0 z-30 lg:hidden"
        style={{
          background: "hsl(var(--nl-linen))",
          borderTop: "1px solid rgba(15,18,24,0.12)",
          boxShadow: "0 -8px 24px rgba(26,18,8,0.08)",
          boxSizing: "border-box",
          maxWidth: "100vw",
        }}
      >
        <div
          className="grid items-center"
          style={{
            gridTemplateColumns: "minmax(0, 1fr) auto",
            gap: 12,
            padding: "12px 16px max(12px, env(safe-area-inset-bottom))",
            boxSizing: "border-box",
            width: "100%",
          }}
        >
          <button
            type="button"
            onClick={() => setMobileSummaryOpen(!isMobileSummaryOpen)}
            className="flex min-w-0 items-center"
            style={{ gap: 8 }}
          >
            <div className="min-w-0 text-start">
              <p
                className="truncate uppercase"
                style={{
                  fontSize: 9,
                  letterSpacing: "0.22em",
                  color: "hsl(var(--nl-russet))",
                }}
              >
                {t("totalDue")}
              </p>
              <p
                className="truncate"
                style={{
                  fontFamily: MAISON_SERIF,
                  fontSize: 22,
                  letterSpacing: "-0.01em",
                  color: "hsl(var(--nl-cacao))",
                }}
              >
                {quote === null ? (
                  <span
                    className="inline-block h-6 w-20 animate-pulse"
                    style={{ background: "rgba(15,18,24,0.1)" }}
                  />
                ) : (
                  formatAed(displayGrandTotalFils)
                )}
              </p>
            </div>
            {isMobileSummaryOpen ? (
              <ChevronDown
                className="h-4 w-4"
                strokeWidth={1.25}
                style={{ color: "hsl(var(--nl-russet))" }}
              />
            ) : (
              <ChevronUp
                className="h-4 w-4"
                strokeWidth={1.25}
                style={{ color: "hsl(var(--nl-russet))" }}
              />
            )}
          </button>
          <button
            type="button"
            onClick={onPlaceOrder}
            disabled={!canOrder || isPlacing}
            className="flex items-center justify-center uppercase transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: "hsl(var(--nl-cacao))",
              color: "hsl(var(--nl-linen))",
              padding: "14px clamp(14px, 4vw, 22px)",
              gap: 10,
              fontSize: 11,
              letterSpacing: "0.24em",
              fontFamily: MAISON_SANS,
              border: "none",
              maxWidth: "52vw",
              whiteSpace: "nowrap",
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
        </div>
      </div>
    </>
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
