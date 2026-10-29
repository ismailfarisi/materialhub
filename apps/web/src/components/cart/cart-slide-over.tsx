"use client";

import { useCart } from "@/lib/queries/cart";
import { formatPrice } from "@/lib/utils";
import { useAuthModalStore } from "@/stores/auth-modal";
import { useAuthStore } from "@/stores/auth";
import { useCartStore } from "@/stores/cart";
import { ArrowRight, Check, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect } from "react";
import { CartItem } from "./cart-item";
import { getFreeShippingProgress } from "./cart-shipping-threshold";

const SERIF_STACK = "var(--font-antic), var(--font-playfair), 'Antic Didone', Georgia, serif";
const SANS_STACK =
  "var(--font-inter-tight), var(--font-dm-sans), 'Inter Tight', system-ui, sans-serif";

export function CartSlideOver() {
  const t = useTranslations("cart");
  const locale = useLocale();
  const { isSlideOverOpen, closeSlideOver } = useCartStore();
  const { data: cart } = useCart();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const openAuthModal = useAuthModalStore((s) => s.open);

  useEffect(() => {
    if (!isSlideOverOpen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSlideOver();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = original;
      window.removeEventListener("keydown", onKey);
    };
  }, [isSlideOverOpen, closeSlideOver]);

  if (!isSlideOverOpen) return null;

  const items = cart?.items || [];
  const pieceCount = items.reduce((sum: number, item: any) => sum + item.quantity, 0);
  const subtotalFils = items.reduce(
    (sum: number, item: any) => sum + item.current_price * item.quantity,
    0,
  );
  const { progress, unlocked, remainingFils } = getFreeShippingProgress(subtotalFils);
  const pieceLabel =
    pieceCount === 1
      ? t("yourEditOne", { count: pieceCount })
      : t("yourEditOther", { count: pieceCount });

  return (
    <>
      <button
        type="button"
        tabIndex={-1}
        aria-label={t("close")}
        className="fixed inset-0 z-40 cursor-default"
        style={{ background: "rgba(26, 18, 8, 0.55)" }}
        onClick={closeSlideOver}
      />
      {/* biome-ignore lint/a11y/useSemanticElements: native <dialog> brings its own positioning/backdrop semantics that conflict with this slide-over layout */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={t("title")}
        className="fixed inset-y-0 end-0 w-full max-w-[460px] z-50 flex flex-col"
        style={{
          background: "hsl(var(--nl-linen))",
          color: "hsl(var(--nl-cacao))",
          fontFamily: SANS_STACK,
          boxShadow: "-24px 0 60px rgba(26,18,8,0.35)",
        }}
      >
        <div className="px-8 pt-5 pb-4" style={{ borderBottom: "1px solid rgba(44,24,16,0.1)" }}>
          <div className="flex items-start justify-between">
            <div>
              <div
                className="flex items-center gap-2 uppercase"
                style={{
                  fontSize: 9.5,
                  letterSpacing: "0.32em",
                  color: "hsl(var(--nl-amber))",
                }}
              >
                <Mark />
                {pieceLabel}
              </div>
              <h2
                className="mt-1.5"
                style={{
                  fontFamily: SERIF_STACK,
                  fontSize: 26,
                  lineHeight: 1.05,
                  letterSpacing: "-0.01em",
                  fontWeight: 400,
                }}
              >
                {t("the")}{" "}
                <span
                  style={{
                    fontStyle: "italic",
                    color: "hsl(var(--nl-amber))",
                  }}
                >
                  {t("bag")}
                </span>
              </h2>
            </div>
            <button
              type="button"
              onClick={closeSlideOver}
              aria-label={t("close")}
              className="grid place-items-center transition-colors hover:bg-black/5"
              style={{
                width: 32,
                height: 32,
                border: "1px solid rgba(44,24,16,0.12)",
                color: "hsl(var(--nl-cacao))",
              }}
            >
              <X className="h-4 w-4" strokeWidth={1.25} />
            </button>
          </div>

          {items.length > 0 && (
            <>
              <div
                className="mt-4 flex items-center gap-2.5"
                style={{ fontSize: 11, color: "hsl(var(--nl-russet))" }}
              >
                {unlocked ? (
                  <>
                    <Check
                      className="h-3.5 w-3.5"
                      strokeWidth={1.5}
                      style={{ color: "hsl(var(--nl-amber))" }}
                    />
                    <span>{t("shippingUnlocked")}</span>
                  </>
                ) : (
                  <span>
                    {t("shippingRemaining", {
                      amount: formatPrice(remainingFils, "AED", locale),
                    })}
                  </span>
                )}
              </div>
              <div className="mt-2" style={{ height: 2, background: "rgba(44,24,16,0.08)" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${progress}%`,
                    background: "hsl(var(--nl-amber))",
                    transition: "width 320ms cubic-bezier(0.2,0.7,0.2,1)",
                  }}
                />
              </div>
            </>
          )}
        </div>

        <div
          className="flex-1 overflow-y-auto px-8"
          style={{ scrollbarColor: "rgba(44,24,16,0.22) transparent" }}
        >
          {items.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center py-16">
              <Mark size={22} />
              <p
                className="mt-6 max-w-[260px]"
                style={{
                  fontFamily: SERIF_STACK,
                  fontSize: 22,
                  lineHeight: 1.25,
                  fontStyle: "italic",
                  color: "hsl(var(--nl-russet))",
                }}
              >
                {t("empty")}
              </p>
              <p
                className="mt-3 max-w-[280px]"
                style={{
                  fontSize: 12,
                  lineHeight: 1.55,
                  color: "hsl(var(--nl-russet))",
                }}
              >
                {t("emptyDek")}
              </p>
              <Link
                href={`/${locale}`}
                onClick={closeSlideOver}
                className="mt-7 inline-flex items-center gap-2 transition-opacity hover:opacity-70 uppercase"
                style={{
                  fontSize: 10.5,
                  letterSpacing: "0.24em",
                  color: "hsl(var(--nl-cacao))",
                  paddingBottom: 4,
                  borderBottom: "1px solid hsl(var(--nl-cacao))",
                }}
              >
                {t("browseCta")}
                <ArrowRight className="h-3 w-3" strokeWidth={1.25} />
              </Link>
            </div>
          ) : (
            items.map((item: any, i: number) => (
              <CartItem
                key={item.variant_id}
                item={item}
                isLast={i === items.length - 1}
                onNavigate={closeSlideOver}
              />
            ))
          )}
        </div>

        {items.length > 0 && (
          <div
            className="px-8 pt-4 pb-5"
            style={{
              borderTop: "1px solid rgba(44,24,16,0.1)",
              background: "hsl(var(--nl-linen))",
            }}
          >
            <div className="grid gap-1.5 text-[12px] mb-3">
              <SummaryRow label={t("subtotal")} value={formatPrice(subtotalFils, "AED", locale)} />
              <SummaryRow label={t("shipping")} value={unlocked ? t("complimentary") : "—"} muted />
              <SummaryRow label={t("estimatedTaxes")} value={t("included")} muted />
            </div>
            <div
              style={{
                height: 1,
                background: "rgba(44,24,16,0.1)",
                marginBottom: 12,
              }}
            />
            <div className="flex items-baseline justify-between mb-3.5">
              <span
                className="uppercase"
                style={{
                  fontSize: 10,
                  letterSpacing: "0.24em",
                  color: "hsl(var(--nl-russet))",
                }}
              >
                {t("total")}
              </span>
              <span
                style={{
                  fontFamily: SERIF_STACK,
                  fontSize: 24,
                  letterSpacing: "-0.01em",
                }}
              >
                {formatPrice(subtotalFils, "AED", locale)}
              </span>
            </div>
            {isAuthenticated ? (
              <Link
                href={`/${locale}/checkout`}
                onClick={closeSlideOver}
                className="flex w-full items-center justify-center gap-3 uppercase transition-opacity hover:opacity-90"
                style={{
                  background: "hsl(var(--nl-amber))",
                  color: "hsl(var(--nl-espresso))",
                  padding: "17px 0",
                  fontSize: 11,
                  letterSpacing: "0.28em",
                }}
              >
                {t("checkout")}
                <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => { openAuthModal("login", `/${locale}/checkout`); closeSlideOver(); }}
                className="flex w-full items-center justify-center gap-3 uppercase transition-opacity hover:opacity-90 cursor-pointer"
                style={{
                  background: "hsl(var(--nl-amber))",
                  color: "hsl(var(--nl-espresso))",
                  padding: "17px 0",
                  fontSize: 11,
                  letterSpacing: "0.28em",
                }}
              >
                {t("checkout")}
                <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
              </button>
            )}
          </div>
        )}
      </aside>
    </>
  );
}

function SummaryRow({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div
      className="flex justify-between"
      style={{
        color: muted ? "hsl(var(--nl-russet))" : "hsl(var(--nl-cacao))",
      }}
    >
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function Mark({ size = 11 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      style={{ width: size, height: size, color: "hsl(var(--nl-amber))" }}
      aria-hidden="true"
      focusable="false"
    >
      <title>MaterialHub UAE mark</title>
      <path d="M 15 4 A 8 8 0 1 0 15 20 A 6 6 0 1 1 15 4 Z" fill="currentColor" />
      <circle cx="20.5" cy="6" r="1.3" fill="currentColor" />
    </svg>
  );
}
