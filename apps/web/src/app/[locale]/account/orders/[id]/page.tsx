"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import Image from "next/image";
import { useOrder } from "@/lib/queries/orders";
import { OrderTimeline } from "@/components/account/order-timeline";
import { ReviewForm } from "@/components/account/review-form";
import { useChannelEvents } from "@/lib/channels/use-channel-events";
import { formatPrice } from "@/lib/utils";
import { API_URL } from "@/lib/api";
import {
  Eyebrow,
  SerifTitle,
  MAISON_SERIF,
  MAISON_SANS,
} from "@/components/checkout/maison-primitives";

const PANEL = {
  border: "1px solid rgba(44,24,16,0.10)",
  background: "rgba(44,24,16,0.02)",
} as const;

export default function OrderDetailPage() {
  const t = useTranslations("account");
  const tCommon = useTranslations("common");
  const tOrderStatus = useTranslations("account.orderStatus");
  const tPayStatus = useTranslations("account.paymentStatus");
  const locale = useLocale();
  const { id } = useParams<{ id: string }>();
  const { data: order, isLoading } = useOrder(id);
  const [reviewingItem, setReviewingItem] = useState<string | null>(null);
  const { fire } = useChannelEvents();

  // Fire the Purchase event (which the Google channel descriptor turns into a
  // gtag `purchase` + Google Ads `conversion` event) once we know the order is
  // paid. `useChannelEvents` keys the event_id by order.id in sessionStorage,
  // so a page refresh re-fires the SAME id and the server-side Enhanced
  // Conversions Adjustment (Task 10) can dedup against it.
  useEffect(() => {
    if (!order) return;
    // Only fire for paid orders. PaymentStatus values: pending, authorized,
    // captured, failed, refunded, partially_refunded, chargeback, cancelled.
    // We treat "captured" (entity-canonical) and "paid" (forward-compat) as
    // the success terminal; everything else is skipped.
    if (
      order.payment_status !== "captured" &&
      order.payment_status !== "paid"
    ) {
      return;
    }

    // Sum quantities across all vendor sub-orders. The API response from
    // `GET /buyer/orders/:id` nests items under `vendorOrders[].items`, not a
    // top-level `items` array — see backend `OrderService.getById`.
    const vendorOrders = order.vendorOrders || order.vendor_orders || [];
    const quantity = vendorOrders.reduce(
      (n: number, vo: { items?: Array<{ quantity?: number }> }) =>
        n +
        (vo.items?.reduce(
          (m: number, i: { quantity?: number }) => m + (i.quantity ?? 0),
          0,
        ) ?? 0),
      0,
    );

    fire("Purchase", {
      order_id: order.id,
      transaction_id: order.id,
      currency: order.currency ?? "AED",
      value_fils: order.grand_total,
      quantity,
      customer_email: order.user?.email ?? undefined,
      customer_phone: order.user?.phone ?? undefined,
    });
  }, [order, fire]);

  if (isLoading) {
    return (
      <div
        style={{
          fontFamily: MAISON_SERIF,
          fontStyle: "italic",
          fontSize: 16,
          color: "hsl(var(--nl-russet))",
        }}
      >
        {tCommon("loading")}
      </div>
    );
  }

  if (!order) return null;

  const vendorOrders = order.vendorOrders || order.vendor_orders || [];
  const addr = order.shipping_address || {};

  const safeTranslate = (fn: (k: any) => string, key: string) => {
    try {
      return fn(key?.toLowerCase());
    } catch {
      return key?.replace(/_/g, " ") || "";
    }
  };

  const rowLabel = {
    fontFamily: MAISON_SANS,
    fontSize: 13,
    color: "hsl(var(--nl-russet))",
  } as const;
  const rowValue = {
    fontFamily: MAISON_SANS,
    fontSize: 13,
    color: "hsl(var(--nl-cacao))",
  } as const;

  return (
    <div>
      <div className="mb-5">
        <Eyebrow>ORDER</Eyebrow>
        <SerifTitle size={26} className="mt-1.5 break-words">
          {t("orderDetail")} #{order.order_number}
        </SerifTitle>
      </div>

      {/* Order summary */}
      <div className="p-4 mb-3 space-y-2" style={PANEL}>
        <div className="flex justify-between gap-2">
          <span style={rowLabel}>{t("status")}</span>
          <span className="text-end" style={rowValue}>
            {safeTranslate(tOrderStatus, order.status)}
          </span>
        </div>
        <div className="flex justify-between gap-2">
          <span style={rowLabel}>{t("payment")}</span>
          <span className="text-end" style={rowValue}>
            {safeTranslate(tPayStatus, order.payment_status)}
          </span>
        </div>
        <div className="flex justify-between gap-2">
          <span style={rowLabel}>{t("subtotal")}</span>
          <span style={rowValue}>
            {formatPrice(order.subtotal, "AED", locale)}
          </span>
        </div>
        {order.discount_total > 0 && (
          <div className="flex justify-between gap-2">
            <span style={{ ...rowLabel, color: "hsl(var(--nl-amber))" }}>
              {t("discount")}
            </span>
            <span style={{ ...rowValue, color: "hsl(var(--nl-amber))" }}>
              -{formatPrice(order.discount_total, "AED", locale)}
            </span>
          </div>
        )}
        <div className="flex justify-between gap-2">
          <span style={rowLabel}>{t("shipping")}</span>
          <span style={rowValue}>
            {order.shipping_total > 0
              ? formatPrice(order.shipping_total, "AED", locale)
              : tCommon("free")}
          </span>
        </div>
        <div className="flex justify-between gap-2">
          <span style={rowLabel}>{t("tax")}</span>
          <span style={rowValue}>
            {formatPrice(order.tax_total, "AED", locale)}
          </span>
        </div>
        {order.refund_total > 0 && (
          <div className="flex justify-between gap-2">
            <span style={{ ...rowLabel, color: "hsl(var(--nl-amber))" }}>
              {t("refunded")}
            </span>
            <span style={{ ...rowValue, color: "hsl(var(--nl-amber))" }}>
              -{formatPrice(order.refund_total, "AED", locale)}
            </span>
          </div>
        )}
        <div
          className="flex justify-between items-baseline gap-2 pt-2.5 mt-1"
          style={{ borderTop: "1px solid rgba(44,24,16,0.10)" }}
        >
          <span
            className="uppercase"
            style={{
              fontFamily: MAISON_SANS,
              fontSize: 11,
              letterSpacing: "0.18em",
              color: "hsl(var(--nl-russet))",
            }}
          >
            {t("total")}
          </span>
          <span
            style={{
              fontFamily: MAISON_SERIF,
              fontSize: 18,
              color: "hsl(var(--nl-cacao))",
            }}
          >
            {formatPrice(order.grand_total, "AED", locale)}
          </span>
        </div>
        {(order.payment_status === "captured" ||
          order.payment_status === "paid" ||
          order.status !== "pending_payment") && (
          <a
            href={`${API_URL}/buyer/orders/${order.id}/invoice.pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="uppercase mt-3 inline-block hover:underline"
            style={{
              fontFamily: MAISON_SANS,
              fontSize: 10,
              letterSpacing: "0.16em",
              color: "hsl(var(--nl-amber))",
            }}
          >
            {t("downloadReceipt")}
          </a>
        )}
      </div>

      {/* Shipping address */}
      <div className="p-4 mb-3" style={PANEL}>
        <Eyebrow className="mb-2">{t("shippingAddress")}</Eyebrow>
        <p
          className="break-words"
          style={{
            fontFamily: MAISON_SANS,
            fontSize: 13,
            color: "hsl(var(--nl-cacao))",
          }}
        >
          {addr.full_name || `${addr.first_name || ""} ${addr.last_name || ""}`.trim()}
        </p>
        <p
          className="break-words"
          style={{
            fontFamily: MAISON_SANS,
            fontSize: 13,
            color: "hsl(var(--nl-russet))",
          }}
        >
          {[addr.building_name, addr.apartment, addr.floor].filter(Boolean).join(", ")}
          {[addr.building_name, addr.apartment, addr.floor].some(Boolean) && <br />}
          {addr.address_line_1 || addr.street}
          {(addr.address_line_2 || addr.area) && `, ${addr.address_line_2 || addr.area}`}
        </p>
        <p
          className="break-words"
          style={{
            fontFamily: MAISON_SANS,
            fontSize: 13,
            color: "hsl(var(--nl-russet))",
          }}
        >
          {addr.city}
          {addr.state || addr.emirate ? `, ${addr.state || addr.emirate}` : ""}
          {addr.country_code ? ` — ${addr.country_code}` : ""}
        </p>
        {addr.phone && (
          <p
            className="break-words"
            style={{
              fontFamily: MAISON_SANS,
              fontSize: 13,
              color: "hsl(var(--nl-russet))",
            }}
          >
            {addr.phone}
          </p>
        )}
      </div>

      {/* Vendor sub-orders */}
      {vendorOrders.map((vo: any) => (
        <div key={vo.id} className="p-4 mb-3" style={PANEL}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
            <h3
              className="break-words"
              style={{
                fontFamily: MAISON_SANS,
                fontSize: 13,
                color: "hsl(var(--nl-cacao))",
              }}
            >
              {vo.vendor_order_number}
            </h3>
            <OrderTimeline currentStatus={vo.status} />
          </div>

          {/* Items */}
          {(vo.items || []).map((item: any) => {
            // Null whenever the product was unpublished or removed — the row
            // then stays plain text rather than linking to a 404.
            const productHref = item.product_slug
              ? `/${locale}/product/${item.product_slug}`
              : null;

            return (
            <div
              key={item.id}
              className="py-3"
              style={{
                borderTop: "1px solid rgba(44,24,16,0.08)",
                opacity: item.status === "cancelled" ? 0.55 : 1,
              }}
            >
              <div className="flex gap-3">
                {productHref ? (
                  <Link
                    href={productHref}
                    aria-label={item.product_name}
                    tabIndex={-1}
                    className="relative h-16 w-16 md:h-14 md:w-14 shrink-0 overflow-hidden"
                    style={{ background: "rgba(44,24,16,0.05)" }}
                  >
                    {item.product_image_url && (
                      <Image
                        src={item.product_image_url}
                        alt={item.product_name}
                        fill
                        className="object-cover"
                      />
                    )}
                  </Link>
                ) : (
                  <div
                    className="relative h-16 w-16 md:h-14 md:w-14 shrink-0 overflow-hidden"
                    style={{ background: "rgba(44,24,16,0.05)" }}
                  >
                    {item.product_image_url && (
                      <Image
                        src={item.product_image_url}
                        alt={item.product_name}
                        fill
                        className="object-cover"
                      />
                    )}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  {productHref ? (
                    <Link
                      href={productHref}
                      className="block break-words transition-opacity hover:opacity-70"
                      style={{
                        fontFamily: MAISON_SANS,
                        fontSize: 13,
                        color: "hsl(var(--nl-cacao))",
                      }}
                    >
                      {item.product_name}
                    </Link>
                  ) : (
                    <p
                      className="break-words"
                      style={{
                        fontFamily: MAISON_SANS,
                        fontSize: 13,
                        color: "hsl(var(--nl-cacao))",
                      }}
                    >
                      {item.product_name}
                    </p>
                  )}
                  {item.variant_name && (
                    <p
                      className="break-words"
                      style={{
                        fontFamily: MAISON_SANS,
                        fontSize: 12,
                        color: "hsl(var(--nl-russet))",
                      }}
                    >
                      {item.variant_name}
                    </p>
                  )}
                  <p
                    style={{
                      fontFamily: MAISON_SANS,
                      fontSize: 12,
                      color: "hsl(var(--nl-russet))",
                    }}
                  >
                    {tCommon("qty")}: {item.quantity} ×{" "}
                    {formatPrice(item.unit_price, "AED", locale)}
                  </p>
                  {item.refunded_quantity > 0 && (
                    <p
                      style={{
                        fontFamily: MAISON_SANS,
                        fontSize: 12,
                        color: "hsl(var(--nl-amber))",
                      }}
                    >
                      {t("cancelledOutOfStock")}: {item.refunded_quantity} ×
                      {" "}— {formatPrice(item.refunded_amount, "AED", locale)}{" "}
                      {t("refundedShort")}
                    </p>
                  )}
                </div>
                <div className="text-end shrink-0">
                  <p
                    className="whitespace-nowrap"
                    style={{
                      fontFamily: MAISON_SERIF,
                      fontSize: 14,
                      color: "hsl(var(--nl-cacao))",
                    }}
                  >
                    {formatPrice(item.line_total, "AED", locale)}
                  </p>
                  {vo.status === "delivered" &&
                    !item.is_reviewed &&
                    reviewingItem !== item.id && (
                      <button
                        onClick={() => setReviewingItem(item.id)}
                        className="uppercase mt-1.5 whitespace-nowrap hover:underline"
                        style={{
                          fontFamily: MAISON_SANS,
                          fontSize: 10,
                          letterSpacing: "0.16em",
                          color: "hsl(var(--nl-amber))",
                        }}
                      >
                        {t("leaveReview")}
                      </button>
                    )}
                </div>
              </div>
              {/* Review form rendered full-width below the item */}
              {vo.status === "delivered" &&
                !item.is_reviewed &&
                reviewingItem === item.id && (
                  <div className="mt-3">
                    <ReviewForm
                      orderItemId={item.id}
                      onClose={() => setReviewingItem(null)}
                    />
                  </div>
                )}
            </div>
            );
          })}

          {/* Tracking */}
          {vo.tracking_number && (
            <div
              className="mt-2 pt-2 break-words"
              style={{
                borderTop: "1px solid rgba(44,24,16,0.08)",
                fontFamily: MAISON_SANS,
                fontSize: 12,
                color: "hsl(var(--nl-russet))",
              }}
            >
              {t("trackShipment")}: {vo.carrier} — {vo.tracking_number}
            </div>
          )}

          {/* Return button for delivered */}
          {vo.status === "delivered" && (
            <Link
              href={`/${locale}/account/orders/${id}/return`}
              className="uppercase mt-2.5 inline-block hover:underline"
              style={{
                fontFamily: MAISON_SANS,
                fontSize: 10,
                letterSpacing: "0.16em",
                color: "hsl(var(--nl-amber))",
              }}
            >
              {t("requestReturn")}
            </Link>
          )}
        </div>
      ))}
    </div>
  );
}
