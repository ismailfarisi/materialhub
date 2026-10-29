"use client";

import { useState } from "react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { useReturn, useUpdateReturnShipping } from "@/lib/queries/orders";
import { ReturnTimeline } from "@/components/account/return-timeline";
import { formatPrice } from "@/lib/utils";
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

function formatDate(iso: string, locale: string) {
  return new Date(iso).toLocaleString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatFils(fils: number | null | undefined, locale: string) {
  if (fils == null) return "—";
  return formatPrice(fils, "AED", locale);
}

export default function ReturnDetailPage() {
  const t = useTranslations("returns");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const { id } = useParams<{ id: string }>();
  const { data: ret, isLoading } = useReturn(id);
  const updateShipping = useUpdateReturnShipping();

  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  if (isLoading) {
    return (
      <p
        className="py-12 text-center"
        style={{
          fontFamily: MAISON_SERIF,
          fontStyle: "italic",
          fontSize: 16,
          color: "hsl(var(--nl-russet))",
        }}
      >
        {tCommon("loading")}
      </p>
    );
  }
  if (!ret) {
    return (
      <p
        className="py-12 text-center"
        style={{
          fontFamily: MAISON_SERIF,
          fontStyle: "italic",
          fontSize: 16,
          color: "hsl(var(--nl-russet))",
        }}
      >
        {t("notFound")}
      </p>
    );
  }

  async function handleShipping(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (!carrier.trim() || !tracking.trim()) return;
    try {
      await updateShipping.mutateAsync({
        id,
        carrier: carrier.trim(),
        tracking_number: tracking.trim(),
      });
      setCarrier("");
      setTracking("");
    } catch (err: any) {
      setSubmitError(
        err?.response?.data?.message ?? err?.message ?? t("errors.submitFailed"),
      );
    }
  }

  const items: any[] = ret.returnItems ?? ret.return_items ?? ret.items ?? [];

  const labelStyle = {
    fontFamily: MAISON_SANS,
    fontSize: 10,
    letterSpacing: "0.16em",
    color: "hsl(var(--nl-russet))",
  } as const;
  const valueStyle = {
    fontFamily: MAISON_SANS,
    fontSize: 13,
    color: "hsl(var(--nl-cacao))",
  } as const;

  return (
    <div className="space-y-6">
      <div className="mb-5">
        <Eyebrow>RETURN</Eyebrow>
        <SerifTitle size={26} className="mt-1.5">
          {ret.return_number ?? ret.id.slice(0, 8)}
        </SerifTitle>
        <p className="mt-1" style={labelStyle}>
          {formatDate(ret.created_at, locale)}
        </p>
      </div>

      <div style={{ ...PANEL, padding: 16 }}>
        <ReturnTimeline currentStatus={ret.status} />
      </div>

      <div className="space-y-2" style={{ ...PANEL, padding: 16 }}>
        <div className="flex justify-between">
          <span className="uppercase" style={labelStyle}>
            {t("statusLabel")}
          </span>
          <span className="uppercase" style={{ ...valueStyle, letterSpacing: "0.16em", fontSize: 11 }}>
            {t(`statuses.${ret.status}`)}
          </span>
        </div>
        <div className="flex justify-between items-baseline">
          <span className="uppercase" style={labelStyle}>
            {t("refundAmount")}
          </span>
          <span style={{ fontFamily: MAISON_SERIF, fontSize: 15, color: "hsl(var(--nl-cacao))" }}>
            {formatFils(ret.refund_amount, locale)}
          </span>
        </div>
        {ret.refunded_at && (
          <div className="flex justify-between">
            <span className="uppercase" style={labelStyle}>
              {t("refundedAt")}
            </span>
            <span style={valueStyle}>{formatDate(ret.refunded_at, locale)}</span>
          </div>
        )}
        {ret.rejection_reason && (
          <div
            className="pt-2 mt-2"
            style={{ borderTop: "1px solid rgba(44,24,16,0.10)" }}
          >
            <div className="uppercase" style={labelStyle}>
              {t("rejectionReason")}
            </div>
            <div className="mt-1" style={valueStyle}>
              {ret.rejection_reason}
            </div>
          </div>
        )}
      </div>

      {items.length > 0 && (
        <div style={{ border: "1px solid rgba(44,24,16,0.10)" }}>
          <div
            className="p-3.5 uppercase"
            style={{
              borderBottom: "1px solid rgba(44,24,16,0.10)",
              fontFamily: MAISON_SANS,
              fontSize: 10,
              letterSpacing: "0.18em",
              color: "hsl(var(--nl-russet))",
            }}
          >
            {t("items")}
          </div>
          <ul>
            {items.map((it: any, idx: number) => {
              const product = it.orderItem ?? it.order_item ?? {};
              const image = product.product_image_url;
              const name =
                product.product_name ?? product.name ?? it.product_name ?? t("items");
              const variant = product.variant_name;
              const unitPrice = product.unit_price;
              const lineTotal = product.line_total;
              const fallbackLineTotal =
                unitPrice != null && it.quantity != null ? unitPrice * it.quantity : null;
              return (
                <li
                  key={it.id}
                  className="p-3.5 flex items-center gap-3"
                  style={
                    idx > 0
                      ? { borderTop: "1px solid rgba(44,24,16,0.08)" }
                      : undefined
                  }
                >
                  <div
                    className="relative h-16 w-16 shrink-0 overflow-hidden"
                    style={{ background: "rgba(44,24,16,0.04)" }}
                  >
                    {image && (
                      <Image
                        src={image}
                        alt={name}
                        fill
                        sizes="64px"
                        className="object-cover"
                      />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className="break-words"
                      style={{
                        fontFamily: MAISON_SANS,
                        fontSize: 13,
                        color: "hsl(var(--nl-cacao))",
                      }}
                    >
                      {name}
                    </p>
                    {variant && (
                      <p
                        className="break-words"
                        style={{
                          fontFamily: MAISON_SANS,
                          fontSize: 11,
                          color: "hsl(var(--nl-russet))",
                        }}
                      >
                        {variant}
                      </p>
                    )}
                    <p
                      style={{
                        fontFamily: MAISON_SANS,
                        fontSize: 11,
                        color: "hsl(var(--nl-russet))",
                      }}
                    >
                      {tCommon("qty")}: {it.quantity}
                      {unitPrice != null ? ` × ${formatFils(unitPrice, locale)}` : ""}
                    </p>
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
                      {formatFils(it.refund_amount ?? lineTotal ?? fallbackLineTotal, locale)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {ret.status === "approved" && (
        <form
          onSubmit={handleShipping}
          className="space-y-3"
          style={{ ...PANEL, padding: 16 }}
        >
          <Eyebrow>{t("shippingTitle")}</Eyebrow>
          <p
            style={{
              fontFamily: MAISON_SERIF,
              fontStyle: "italic",
              fontSize: 12,
              color: "hsl(var(--nl-russet))",
            }}
          >
            {t("shippingHint")}
          </p>
          <div>
            <label
              htmlFor="carrier"
              className="block mb-1.5 uppercase"
              style={{
                fontFamily: MAISON_SANS,
                fontSize: 10,
                letterSpacing: "0.18em",
                color: "hsl(var(--nl-russet))",
              }}
            >
              {t("carrier")} *
            </label>
            <input
              id="carrier"
              type="text"
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
              required
              maxLength={100}
              className="w-full px-2.5 py-2 text-sm"
              style={{
                border: "1px solid rgba(44,24,16,0.2)",
                background: "rgba(255,255,255,0.55)",
                borderRadius: 0,
                color: "hsl(var(--nl-cacao))",
                fontFamily: MAISON_SANS,
              }}
            />
          </div>
          <div>
            <label
              htmlFor="tracking"
              className="block mb-1.5 uppercase"
              style={{
                fontFamily: MAISON_SANS,
                fontSize: 10,
                letterSpacing: "0.18em",
                color: "hsl(var(--nl-russet))",
              }}
            >
              {t("trackingNumber")} *
            </label>
            <input
              id="tracking"
              type="text"
              value={tracking}
              onChange={(e) => setTracking(e.target.value)}
              required
              maxLength={100}
              className="w-full px-2.5 py-2 text-sm"
              style={{
                border: "1px solid rgba(44,24,16,0.2)",
                background: "rgba(255,255,255,0.55)",
                borderRadius: 0,
                color: "hsl(var(--nl-cacao))",
                fontFamily: MAISON_SANS,
              }}
            />
          </div>
          {submitError && (
            <p
              style={{
                fontFamily: MAISON_SANS,
                fontSize: 12,
                color: "hsl(0,55%,42%)",
              }}
            >
              {submitError}
            </p>
          )}
          <button
            type="submit"
            disabled={updateShipping.isPending || !carrier.trim() || !tracking.trim()}
            className="disabled:opacity-50"
            style={{
              background: "hsl(var(--nl-amber))",
              color: "hsl(var(--nl-espresso))",
              fontFamily: MAISON_SANS,
              fontSize: 11,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              padding: "13px 30px",
              border: "none",
              borderRadius: 0,
            }}
          >
            {updateShipping.isPending ? tCommon("loading") : t("submitShipping")}
          </button>
        </form>
      )}

      {(ret.status === "shipped_back" || ret.status === "received" || ret.status === "refunded") &&
        ret.return_tracking_number && (
          <div className="space-y-1.5" style={{ ...PANEL, padding: 16 }}>
            <div
              className="uppercase"
              style={{
                fontFamily: MAISON_SANS,
                fontSize: 10,
                letterSpacing: "0.18em",
                color: "hsl(var(--nl-russet))",
              }}
            >
              {t("shippingRecorded")}
            </div>
            <div
              style={{
                fontFamily: MAISON_SANS,
                fontSize: 13,
                color: "hsl(var(--nl-cacao))",
              }}
            >
              {ret.return_shipping_carrier} — {ret.return_tracking_number}
            </div>
          </div>
        )}
    </div>
  );
}
