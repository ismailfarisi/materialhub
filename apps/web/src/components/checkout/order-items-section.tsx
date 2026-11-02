"use client";

import { useLocale, useTranslations } from "next-intl";
import Image from "next/image";
import { formatPrice } from "@/lib/utils";
import { MAISON_SANS, MAISON_SERIF, MaisonMark } from "./maison-primitives";

interface OrderItemsSectionProps {
  items: any[];
}

export function OrderItemsSection({ items }: OrderItemsSectionProps) {
  const tCart = useTranslations("cart");
  const locale = useLocale();

  if (items.length === 0) return null;

  const pieceCount = items.reduce(
    (sum: number, item: any) => sum + item.quantity,
    0,
  );
  const piecesLabel =
    pieceCount === 1
      ? tCart("yourEditOne", { count: pieceCount })
      : tCart("yourEditOther", { count: pieceCount });

  return (
    <section className="lg:hidden mb-6">
      <div className="flex items-center mb-3" style={{ gap: 10 }}>
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
          border: "1px solid rgba(15,18,24,0.08)",
          background: "rgba(255,255,255,0.55)",
        }}
      >
        {items.map((item: any, i: number) => (
          <div
            key={item.variant_id}
            className="grid items-center"
            style={{
              gridTemplateColumns: "60px 1fr auto",
              gap: 14,
              padding: "12px 14px",
              borderTop:
                i === 0 ? "none" : "1px solid rgba(15,18,24,0.08)",
            }}
          >
            {/* The quantity badge sits outside the thumbnail box, so the
                clipping lives on an inner wrapper — not this container. */}
            <div className="relative" style={{ aspectRatio: "1 / 1" }}>
              <div
                className="absolute inset-0 overflow-hidden"
                style={{
                  background: "hsl(var(--nl-linen))",
                  border: "1px solid rgba(15,18,24,0.08)",
                }}
              >
                <Image
                  src={item.image_url}
                  alt={item.product_title}
                  fill
                  sizes="60px"
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
              {formatPrice(
                item.current_price * item.quantity,
                "AED",
                locale,
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
