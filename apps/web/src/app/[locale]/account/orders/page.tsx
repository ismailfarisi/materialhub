"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useOrders } from "@/lib/queries/orders";
import { formatDate, formatPrice } from "@/lib/utils";
import {
  Eyebrow,
  SerifTitle,
  MAISON_SERIF,
  MAISON_SANS,
} from "@/components/checkout/maison-primitives";

export default function OrdersPage() {
  const t = useTranslations("account");
  const tCommon = useTranslations("common");
  const tStatus = useTranslations("account.orderStatus");
  const locale = useLocale();
  const { data, isLoading } = useOrders();

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

  const orders = data || [];

  const translateStatus = (status: string) => {
    const key = status?.toLowerCase();
    try {
      return tStatus(key as any);
    } catch {
      return key?.replace(/_/g, " ") || "";
    }
  };

  return (
    <div>
      <div className="mb-5">
        <Eyebrow>ORDERS</Eyebrow>
        <SerifTitle size={26} className="mt-1.5">
          {t("orderHistory")}
        </SerifTitle>
      </div>
      {orders.length === 0 ? (
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
        <div className="space-y-2 md:space-y-3">
          {orders.map((order: any) => {
            const isDelivered = order.status === "delivered";
            const isCancelled = order.status === "cancelled";
            return (
              <Link
                key={order.id}
                href={`/${locale}/account/orders/${order.id}`}
                className="block p-3.5 md:p-4 transition-colors"
                style={{
                  border: "1px solid rgba(15,18,24,0.10)",
                  background: "rgba(15,18,24,0.02)",
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="truncate"
                    style={{
                      fontFamily: MAISON_SANS,
                      fontSize: 13,
                      color: "hsl(var(--nl-cacao))",
                    }}
                  >
                    #{order.order_number}
                  </span>
                  <span
                    className="uppercase whitespace-nowrap"
                    style={{
                      fontFamily: MAISON_SANS,
                      fontSize: 10,
                      letterSpacing: "0.18em",
                      padding: "3px 8px",
                      border: `1px solid ${
                        isDelivered
                          ? "rgba(74,103,65,0.35)"
                          : isCancelled
                            ? "rgba(140,55,45,0.35)"
                            : "rgba(184,115,51,0.4)"
                      }`,
                      background: isDelivered
                        ? "rgba(74,103,65,0.08)"
                        : isCancelled
                          ? "rgba(140,55,45,0.07)"
                          : "rgba(184,115,51,0.07)",
                      color: isDelivered
                        ? "rgb(74,103,65)"
                        : isCancelled
                          ? "rgb(140,55,45)"
                          : "hsl(var(--nl-russet))",
                    }}
                  >
                    {translateStatus(order.status)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 mt-1.5">
                  <span
                    className="truncate"
                    style={{
                      fontFamily: MAISON_SANS,
                      fontSize: 12,
                      color: "hsl(var(--nl-russet))",
                    }}
                  >
                    {formatDate(order.created_at, locale)}
                  </span>
                  <span
                    className="whitespace-nowrap"
                    style={{
                      fontFamily: MAISON_SERIF,
                      fontSize: 15,
                      color: "hsl(var(--nl-cacao))",
                    }}
                  >
                    {formatPrice(order.grand_total, order.currency || "AED", locale)}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
