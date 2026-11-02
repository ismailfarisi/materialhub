"use client";

import { filsToAed } from "@/lib/money";
import type { QuoteShippingMethod } from "@/lib/queries/checkout-quote";
import { useCheckoutStore } from "@/stores/checkout";
import { Clock, Package, Truck, Zap } from "lucide-react";
import { useTranslations } from "next-intl";
import { MAISON_SANS, MAISON_SERIF, MaisonCard, MaisonRadio } from "./maison-primitives";

const METHOD_ICONS: Record<string, typeof Truck> = {
  standard: Truck,
  express: Zap,
  same_day: Clock,
  pickup: Package,
};

export function ShippingSection() {
  const t = useTranslations("checkout");
  const tCommon = useTranslations("common");

  const {
    quoteData,
    selectedShippingByGroup,
    expandedShippingGroupId,
    setSelectedShipping,
    setExpandedShippingGroup,
  } = useCheckoutStore();

  if (!quoteData) return null;

  if (quoteData.requires_address || quoteData.shipping === null) {
    return (
      <MaisonCard title={t("shipping")}>
        <div className="text-sm" style={{ color: "hsl(var(--nl-russet))" }}>
          {t("selectAddress")}
        </div>
      </MaisonCard>
    );
  }

  const { groups } = quoteData.shipping;
  const showGroupLabels = groups.length > 1;

  const freeThresholds = groups
    .flatMap((g) => g.methods)
    .map((m) => m.free_threshold_fils)
    .filter((v): v is number => v !== null);
  const lowestThresholdFils = freeThresholds.length > 0 ? Math.min(...freeThresholds) : null;

  const isShippingFree = quoteData.totals.shipping_fils === 0;
  const remainingFils =
    lowestThresholdFils !== null
      ? Math.max(0, lowestThresholdFils - quoteData.totals.subtotal_fils)
      : 0;

  const eyebrowHint = isShippingFree
    ? t("freeShippingQualified")
    : remainingFils > 0
      ? t("freeShippingRemaining", { remaining: filsToAed(remainingFils) })
      : undefined;

  return (
    <MaisonCard title={t("shipping")} eyebrowHint={eyebrowHint}>
      {groups.map((group) => {
        const selectedMethodId = selectedShippingByGroup[group.group_id] ?? group.selected;
        const isCollapsed = expandedShippingGroupId !== group.group_id;
        const selected = group.methods.find((m) => m.id === selectedMethodId) ?? group.methods[0];

        return (
          <div key={group.group_id} className="mb-3 last:mb-0">
            {showGroupLabels && group.label_key && (
              <p
                className="mb-2 uppercase"
                style={{
                  fontSize: 10,
                  letterSpacing: "0.22em",
                  color: "hsl(var(--nl-russet))",
                }}
              >
                {t(group.label_key as any)}
              </p>
            )}

            {isCollapsed && selected ? (
              <ShippingTile
                method={selected}
                selected
                showChange
                onChange={() => setExpandedShippingGroup(group.group_id)}
                today={tCommon("today")}
                daysLabel={tCommon("days")}
                t={t}
                free={isShippingFree}
              />
            ) : (
              <div className="space-y-2">
                {group.methods.map((method: QuoteShippingMethod) => (
                  <ShippingTile
                    key={method.id}
                    method={method}
                    selected={selectedMethodId === method.id}
                    onClick={() => {
                      if (!method.available) return;
                      setSelectedShipping(group.group_id, method.id);
                      setExpandedShippingGroup(null);
                    }}
                    today={tCommon("today")}
                    daysLabel={tCommon("days")}
                    t={t}
                    free={isShippingFree}
                    unavailable={!method.available}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </MaisonCard>
  );
}

function ShippingTile({
  method,
  selected,
  onClick,
  showChange,
  onChange,
  today,
  daysLabel,
  t,
  free,
  unavailable,
}: {
  method: QuoteShippingMethod;
  selected: boolean;
  onClick?: () => void;
  showChange?: boolean;
  onChange?: () => void;
  today: string;
  daysLabel: string;
  t: (key: any, params?: any) => string;
  free: boolean;
  unavailable?: boolean;
}) {
  const Icon = METHOD_ICONS[method.id] ?? Truck;
  const isToday = method.estimated_days.min === 0 && method.estimated_days.max === 0;
  const eta = isToday
    ? today
    : `${method.estimated_days.min}–${method.estimated_days.max} ${daysLabel}`;

  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={`transition-all ${unavailable ? "opacity-50 cursor-not-allowed" : onClick ? "cursor-pointer" : ""}`}
      style={{
        padding: "12px 16px",
        display: "grid",
        gridTemplateColumns: showChange ? "20px 28px 1fr auto auto" : "20px 28px 1fr auto",
        gap: 14,
        alignItems: "center",
        border: `1px solid ${selected ? "hsl(var(--nl-amber))" : "rgba(15,18,24,0.16)"}`,
        background: selected ? "rgba(184,115,51,0.06)" : "rgba(255,255,255,0.55)",
      }}
    >
      <MaisonRadio selected={selected} />
      <Icon className="h-5 w-5" strokeWidth={1.25} style={{ color: "hsl(var(--nl-cacao))" }} />
      <div className="min-w-0">
        <div
          className="capitalize truncate"
          style={{
            fontFamily: MAISON_SERIF,
            fontSize: 14.5,
            color: "hsl(var(--nl-cacao))",
          }}
        >
          {t(`shippingMethod_${method.id}` as any)}
        </div>
        {unavailable && method.reason_key ? (
          <div className="text-xs" style={{ color: "hsl(var(--destructive))" }}>
            {t(method.reason_key as any)}
          </div>
        ) : (
          <div
            style={{
              fontSize: 11.5,
              color: "hsl(var(--nl-russet))",
              marginTop: 2,
            }}
          >
            {eta}
          </div>
        )}
      </div>
      <div
        style={{
          fontFamily: MAISON_SERIF,
          fontSize: 14,
          color: free && selected ? "hsl(var(--nl-amber-text))" : "hsl(var(--nl-cacao))",
        }}
      >
        {free && selected ? t("complimentary") : ""}
      </div>
      {showChange && onChange && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onChange();
          }}
          className="uppercase transition-opacity hover:opacity-70"
          style={{
            fontSize: 10,
            letterSpacing: "0.22em",
            color: "hsl(var(--nl-russet))",
            borderBottom: "1px solid rgba(15,18,24,0.2)",
            paddingBottom: 1,
            fontFamily: MAISON_SANS,
          }}
        >
          {t("changeTo")}
        </button>
      )}
    </div>
  );
}
