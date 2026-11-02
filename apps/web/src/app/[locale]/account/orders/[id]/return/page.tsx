"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { useOrder } from "@/lib/queries/orders";
import {
  type CreateReturnPayload,
  type ReturnReason,
  useCreateReturn,
} from "@/lib/queries/orders";
import {
  Eyebrow,
  SerifTitle,
  MAISON_SERIF,
  MAISON_SANS,
} from "@/components/checkout/maison-primitives";

const REASONS: ReturnReason[] = [
  "defective",
  "wrong_item",
  "not_as_described",
  "changed_mind",
  "arrived_late",
  "other",
];

const FIELD_STYLE = {
  border: "1px solid rgba(15,18,24,0.2)",
  background: "rgba(255,255,255,0.55)",
  fontFamily: MAISON_SANS,
  fontSize: 13,
  color: "hsl(var(--nl-cacao))",
} as const;

const FIELD_LABEL = {
  fontFamily: MAISON_SANS,
  fontSize: 11,
  letterSpacing: "0.12em",
  textTransform: "uppercase" as const,
  color: "hsl(var(--nl-russet))",
};

type SelectedItem = {
  vendor_order_id: string;
  order_item_id: string;
  max_quantity: number;
  quantity: number;
  title: string;
};

export default function ReturnPage() {
  const t = useTranslations("account");
  const tReturns = useTranslations("returns");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: order, isLoading } = useOrder(id);
  const createReturn = useCreateReturn();

  // Buyer can only return delivered items. A Return belongs to a single
  // vendor_order, so we group selection state by vendor_order_id and submit
  // one Return per group. TypeORM serializes the relation as camelCase
  // `vendorOrders`; the snake_case fallback is defensive in case a different
  // serializer is wired in the future.
  const allVendorOrders = order?.vendorOrders || order?.vendor_orders || [];
  const deliveredVendorOrders = allVendorOrders.filter(
    (vo: any) => vo.status === "delivered",
  );

  const [selectedByVendor, setSelectedByVendor] = useState<
    Record<string, Record<string, SelectedItem>>
  >({});
  const [reasonByVendor, setReasonByVendor] = useState<Record<string, ReturnReason | "">>({});
  const [detailsByVendor, setDetailsByVendor] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  function toggleItem(vendor_order_id: string, item: any) {
    setSelectedByVendor((prev) => {
      const vendorMap = { ...(prev[vendor_order_id] ?? {}) };
      if (vendorMap[item.id]) {
        delete vendorMap[item.id];
      } else {
        vendorMap[item.id] = {
          vendor_order_id,
          order_item_id: item.id,
          max_quantity: item.quantity,
          quantity: 1,
          title: item.product_name ?? item.title ?? "",
        };
      }
      return { ...prev, [vendor_order_id]: vendorMap };
    });
  }

  function setItemQuantity(vendor_order_id: string, order_item_id: string, qty: number) {
    setSelectedByVendor((prev) => {
      const vendorMap = { ...(prev[vendor_order_id] ?? {}) };
      const existing = vendorMap[order_item_id];
      if (!existing) return prev;
      const clamped = Math.max(1, Math.min(qty, existing.max_quantity));
      vendorMap[order_item_id] = { ...existing, quantity: clamped };
      return { ...prev, [vendor_order_id]: vendorMap };
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    const groups = Object.entries(selectedByVendor).filter(
      ([, items]) => Object.keys(items).length > 0,
    );
    if (groups.length === 0) return;

    // Validate every group has a top-level reason picked
    for (const [vendor_order_id] of groups) {
      if (!reasonByVendor[vendor_order_id]) {
        setSubmitError(tReturns("errors.reasonRequired"));
        return;
      }
    }

    try {
      for (const [vendor_order_id, items] of groups) {
        const reason = reasonByVendor[vendor_order_id] as ReturnReason;
        const reason_details = detailsByVendor[vendor_order_id]?.trim() || undefined;
        const payload: CreateReturnPayload = {
          orderId: id,
          vendor_order_id,
          reason,
          reason_details,
          items: Object.values(items).map((it) => ({
            order_item_id: it.order_item_id,
            quantity: it.quantity,
            reason,
          })),
        };
        await createReturn.mutateAsync(payload);
      }
      router.push(`/${locale}/account/returns`);
    } catch (err: any) {
      setSubmitError(
        err?.response?.data?.message ?? err?.message ?? tReturns("errors.submitFailed"),
      );
    }
  }

  if (isLoading) {
    return (
      <div>
        <div className="mb-5">
          <Eyebrow>RETURN</Eyebrow>
          <SerifTitle size={26} className="mt-1.5">
            {t("requestReturn")}
          </SerifTitle>
        </div>
        <p
          style={{
            fontFamily: MAISON_SERIF,
            fontStyle: "italic",
            fontSize: 15,
            color: "hsl(var(--nl-russet))",
          }}
        >
          {tCommon("loading")}
        </p>
      </div>
    );
  }

  if (deliveredVendorOrders.length === 0) {
    return (
      <div>
        <div className="mb-5">
          <Eyebrow>RETURN</Eyebrow>
          <SerifTitle size={26} className="mt-1.5">
            {t("requestReturn")}
          </SerifTitle>
        </div>
        <div
          className="py-12 text-center"
          style={{
            fontFamily: MAISON_SERIF,
            fontStyle: "italic",
            fontSize: 16,
            color: "hsl(var(--nl-russet))",
          }}
        >
          {tReturns("noReturnableItems")}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5">
        <Eyebrow>RETURN</Eyebrow>
        <SerifTitle size={26} className="mt-1.5">
          {t("requestReturn")}
        </SerifTitle>
      </div>
      <form onSubmit={handleSubmit} className="space-y-6">
        {deliveredVendorOrders.map((vo: any) => {
          const vendorItems = selectedByVendor[vo.id] ?? {};
          const hasSelection = Object.keys(vendorItems).length > 0;
          return (
            <div
              key={vo.id}
              className="p-4 space-y-3"
              style={{
                border: "1px solid rgba(15,18,24,0.10)",
                background: "rgba(15,18,24,0.02)",
              }}
            >
              <div
                style={{
                  fontFamily: MAISON_SANS,
                  fontSize: 13,
                  color: "hsl(var(--nl-cacao))",
                }}
              >
                {vo.vendor_name ?? vo.vendor?.name ?? vo.vendor_order_number ?? tReturns("shipment")}
              </div>

              {(vo.items ?? []).map((item: any) => {
                const selected = vendorItems[item.id];
                return (
                  <div
                    key={item.id}
                    className="p-3"
                    style={{ border: "1px solid rgba(15,18,24,0.10)" }}
                  >
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={!!selected}
                        onChange={() => toggleItem(vo.id, item)}
                        style={{ accentColor: "hsl(var(--nl-amber))" }}
                      />
                      <span
                        className="flex-1"
                        style={{
                          fontFamily: MAISON_SANS,
                          fontSize: 13,
                          color: "hsl(var(--nl-cacao))",
                        }}
                      >
                        {item.product_name ?? item.title}
                      </span>
                      {item.quantity > 1 && (
                        <span
                          style={{
                            fontFamily: MAISON_SANS,
                            fontSize: 12,
                            color: "hsl(var(--nl-russet))",
                          }}
                        >
                          {tReturns("ofMax", { max: item.quantity })}
                        </span>
                      )}
                    </label>
                    {selected && item.quantity > 1 && (
                      <div className="mt-2 ms-6 flex items-center gap-2">
                        <label style={FIELD_LABEL} htmlFor={`qty-${item.id}`}>
                          {tReturns("quantity")}
                        </label>
                        <input
                          id={`qty-${item.id}`}
                          type="number"
                          min={1}
                          max={selected.max_quantity}
                          value={selected.quantity}
                          onChange={(e) =>
                            setItemQuantity(vo.id, item.id, parseInt(e.target.value, 10) || 1)
                          }
                          className="w-20 px-2 py-1"
                          style={FIELD_STYLE}
                        />
                      </div>
                    )}
                  </div>
                );
              })}

              {hasSelection && (
                <div
                  className="space-y-2 pt-2"
                  style={{ borderTop: "1px solid rgba(15,18,24,0.10)" }}
                >
                  <div>
                    <label className="block mb-1" style={FIELD_LABEL}>
                      {tReturns("reason")} *
                    </label>
                    <select
                      value={reasonByVendor[vo.id] ?? ""}
                      onChange={(e) =>
                        setReasonByVendor((prev) => ({
                          ...prev,
                          [vo.id]: e.target.value as ReturnReason,
                        }))
                      }
                      required
                      className="w-full px-2 py-1.5"
                      style={FIELD_STYLE}
                    >
                      <option value="">{tReturns("selectReason")}</option>
                      {REASONS.map((r) => (
                        <option key={r} value={r}>
                          {tReturns(`reasons.${r}`)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block mb-1" style={FIELD_LABEL}>
                      {tReturns("additionalDetails")}
                    </label>
                    <textarea
                      value={detailsByVendor[vo.id] ?? ""}
                      onChange={(e) =>
                        setDetailsByVendor((prev) => ({ ...prev, [vo.id]: e.target.value }))
                      }
                      rows={2}
                      maxLength={2000}
                      className="w-full px-2 py-1.5"
                      style={FIELD_STYLE}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {submitError && (
          <p
            style={{
              fontFamily: MAISON_SANS,
              fontSize: 13,
              color: "rgb(140,55,45)",
            }}
          >
            {submitError}
          </p>
        )}

        <button
          type="submit"
          disabled={
            Object.values(selectedByVendor).every((v) => Object.keys(v).length === 0) ||
            createReturn.isPending
          }
          className="uppercase disabled:opacity-50"
          style={{
            background: "hsl(var(--nl-amber))",
            color: "hsl(var(--nl-espresso))",
            fontFamily: MAISON_SANS,
            fontSize: 11,
            letterSpacing: "0.22em",
            padding: "13px 30px",
            border: "none",
            borderRadius: 0,
          }}
        >
          {createReturn.isPending ? tCommon("loading") : tCommon("submit")}
        </button>
      </form>
    </div>
  );
}
