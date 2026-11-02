"use client";

import { useApplyCoupon, useAvailableCoupons, useRemoveCoupon } from "@/lib/queries/checkout";
import { formatPrice } from "@/lib/utils";
import { useCheckoutStore } from "@/stores/checkout";
import { Tag, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { MAISON_SANS, MAISON_SERIF } from "./maison-primitives";

interface CouponSectionProps {
  /** Called after the coupon changes on the cart so the quote can refetch. */
  onChanged?: () => void | Promise<void>;
}

export function CouponSection({ onChanged }: CouponSectionProps) {
  const t = useTranslations("checkout");
  const { couponCode, discount, quoteData, setCoupon } = useCheckoutStore();
  const applyCoupon = useApplyCoupon();
  const removeCoupon = useRemoveCoupon();

  const [input, setInput] = useState(couponCode);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // The coupon lives on the server-side cart, so after a reload the store is
  // empty but the quote still reports it — trust the quote as the fallback.
  const appliedCode = couponCode || quoteData?.totals.coupon_code || "";
  const appliedDiscount = discount || quoteData?.totals.discount_fils || 0;
  const isApplied = !!appliedCode;

  const { data: availableCoupons } = useAvailableCoupons(!isApplied);

  async function handleApply(codeOverride?: string) {
    const code = (codeOverride ?? input)?.trim();
    if (!code) return;
    setLoading(true);
    setError("");
    try {
      const result = await applyCoupon.mutateAsync({ coupon_code: code });
      setCoupon(result.code, result.discount);
      setInput(result.code);
      await onChanged?.();
    } catch (err: any) {
      setError(err.response?.data?.message || t("couponFailed"));
      setCoupon("", 0);
    } finally {
      setLoading(false);
    }
  }

  function offerLabel(c: { type: string; discount: number }) {
    if (c.type === "free_shipping") return t("freeShipping");
    return `-${formatPrice(c.discount)}`;
  }

  async function handleRemove() {
    setLoading(true);
    try {
      await removeCoupon.mutateAsync({});
      setCoupon("", 0);
      setInput("");
      setError("");
      await onChanged?.();
    } catch {
      // Cart unchanged server-side; keep the chip so the user can retry.
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mb-6">
      {isApplied ? (
        <div
          className="flex items-center text-sm"
          style={{
            gap: 10,
            padding: "12px 14px",
            border: "1px solid hsl(var(--nl-amber))",
            background: "rgba(184,115,51,0.06)",
          }}
        >
          <Tag className="h-4 w-4" strokeWidth={1.25} style={{ color: "hsl(var(--nl-amber))" }} />
          <span
            className="uppercase"
            style={{
              fontSize: 10,
              letterSpacing: "0.22em",
              color: "hsl(var(--nl-amber-text))",
            }}
          >
            {appliedCode}
          </span>
          {appliedDiscount > 0 && (
            <span
              style={{
                fontFamily: MAISON_SERIF,
                color: "hsl(var(--nl-cacao))",
              }}
            >
              -{formatPrice(appliedDiscount)}
            </span>
          )}
          <button
            type="button"
            onClick={handleRemove}
            disabled={loading}
            className="ms-auto transition-opacity hover:opacity-100"
            style={{ opacity: 0.55, color: "hsl(var(--nl-cacao))" }}
            aria-label={t("removeCoupon")}
          >
            <X className="h-4 w-4" strokeWidth={1.25} />
          </button>
        </div>
      ) : (
        <div className="flex" style={{ border: "1px solid rgba(15,18,24,0.16)" }}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleApply()}
            placeholder={t("couponPlaceholder")}
            className="flex-1 outline-none placeholder:text-[hsl(22_32%_40%)] placeholder:opacity-100"
            style={{
              padding: "12px 14px",
              border: "none",
              background: "transparent",
              fontFamily: MAISON_SERIF,
              fontStyle: "italic",
              fontSize: 13,
              color: "hsl(var(--nl-cacao))",
            }}
          />
          <button
            type="button"
            onClick={() => handleApply()}
            disabled={loading || !input?.trim()}
            className="uppercase transition-opacity hover:opacity-70 disabled:opacity-60"
            style={{
              padding: "0 18px",
              border: "none",
              borderLeft: "1px solid rgba(15,18,24,0.16)",
              background: "transparent",
              fontSize: 10,
              letterSpacing: "0.22em",
              color: "hsl(var(--nl-russet))",
              fontFamily: MAISON_SANS,
            }}
          >
            {loading ? "..." : t("applyCoupon")}
          </button>
        </div>
      )}
      {error && (
        <p className="text-sm mt-1.5" style={{ color: "hsl(var(--destructive))" }}>
          {error}
        </p>
      )}
      {!isApplied && (availableCoupons?.length ?? 0) > 0 && (
        <div className="mt-2.5">
          <p
            className="uppercase"
            style={{
              fontSize: 10,
              letterSpacing: "0.22em",
              color: "hsl(var(--nl-russet))",
              fontFamily: MAISON_SANS,
              marginBottom: 6,
            }}
          >
            {t("availableCoupons")}
          </p>
          <div className="flex flex-wrap" style={{ gap: 8 }}>
            {availableCoupons!.map((c) => (
              <button
                key={c.code}
                type="button"
                onClick={() => handleApply(c.code)}
                disabled={loading}
                className="flex items-center transition-opacity hover:opacity-70 disabled:opacity-40"
                style={{
                  gap: 8,
                  padding: "7px 12px",
                  border: "1px dashed hsl(var(--nl-amber))",
                  background: "rgba(184,115,51,0.04)",
                }}
                title={c.name}
              >
                <Tag
                  className="h-3.5 w-3.5"
                  strokeWidth={1.25}
                  style={{ color: "hsl(var(--nl-amber))" }}
                />
                <span
                  className="uppercase"
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.18em",
                    color: "hsl(var(--nl-amber-text))",
                  }}
                >
                  {c.code}
                </span>
                <span
                  style={{
                    fontFamily: MAISON_SERIF,
                    fontSize: 12,
                    color: "hsl(var(--nl-cacao))",
                  }}
                >
                  {offerLabel(c)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
