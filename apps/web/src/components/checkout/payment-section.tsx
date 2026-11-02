"use client";

import { filsToAed } from "@/lib/money";
import { usePaymentInstruments } from "@/lib/queries/checkout-quote";
import type { CheckoutQuotePaymentMethod } from "@/lib/queries/checkout-quote";
import { type PaymentMethod, useCheckoutStore } from "@/stores/checkout";
import { CardElement, ExpressCheckoutElement } from "@stripe/react-stripe-js";
import { Banknote, Clock, CreditCard, Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { MAISON_SANS, MAISON_SERIF, MaisonCard, MaisonTile } from "./maison-primitives";

const METHOD_ICONS: Record<string, typeof CreditCard> = {
  card: CreditCard,
  cod: Banknote,
  tabby: Clock,
  tamara: Clock,
};

const METHOD_NAME_KEYS: Record<string, string> = {
  card: "cardPayment",
  cod: "cod",
};

const STATIC_LABELS: Record<string, string> = {
  tabby: "Tabby",
  tamara: "Tamara",
};

// Reason templates ("between {min} and {max} AED") take values from the
// quote's typed reason_params — money values arrive in fils.
function reasonValues(params?: Record<string, unknown>): Record<string, string | number> {
  return Object.fromEntries(
    Object.entries(params ?? {}).map(([k, v]: [string, any]) => [
      k,
      v?.type === "money" ? filsToAed(v.value) : (v?.value ?? ""),
    ]),
  );
}

interface PaymentSectionProps {
  onExpressCheckoutConfirm?: Parameters<typeof ExpressCheckoutElement>[0]["onConfirm"];
}

export function PaymentSection({ onExpressCheckoutConfirm }: PaymentSectionProps) {
  const t = useTranslations("checkout");

  const { quoteData, paymentMethod, setPaymentMethod } = useCheckoutStore();
  const { data: instrumentsData } = usePaymentInstruments();

  const paymentMethods = (quoteData?.payment_methods ?? []).filter(
    (method) => method.id !== "tabby"
  );
  const savedCards = instrumentsData?.instruments ?? [];
  const grandTotalFils = quoteData?.totals.grand_total_fils ?? 0;

  return (
    <MaisonCard title={t("paymentTitle")}>
      <div
        className="grid mb-3.5"
        style={{
          gridTemplateColumns: `repeat(${Math.min(paymentMethods.length || 3, 4)}, 1fr)`,
          gap: 10,
        }}
      >
        {paymentMethods.map((method: CheckoutQuotePaymentMethod) => {
          const Icon = METHOD_ICONS[method.id] ?? CreditCard;
          const labelKey = METHOD_NAME_KEYS[method.id];
          const label = STATIC_LABELS[method.id] ?? (labelKey ? t(labelKey as any) : method.id);
          const isSelected = paymentMethod === method.id;
          return (
            <MaisonTile
              key={method.id}
              selected={isSelected}
              disabled={!method.available}
              onClick={() => method.available && setPaymentMethod(method.id as PaymentMethod)}
              className="flex flex-col items-center justify-center"
            >
              <div
                style={{
                  padding: "14px 10px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 6,
                  width: "100%",
                }}
              >
                {method.id === "tamara" ? (
                  <img
                    src="/tamara-logo.png"
                    alt="Tamara"
                    className="h-5 w-auto object-contain"
                  />
                ) : (
                  <Icon
                    className="h-5 w-5"
                    strokeWidth={1.25}
                    style={{ color: "hsl(var(--nl-cacao))" }}
                  />
                )}
                <div
                  style={{
                    fontFamily: MAISON_SERIF,
                    fontSize: 13,
                    color: "hsl(var(--nl-cacao))",
                  }}
                >
                  {label}
                </div>
                {!method.available && method.reason_key && (
                  <div
                    className="uppercase text-center"
                    style={{
                      fontSize: 8.5,
                      letterSpacing: "0.18em",
                      color: "hsl(var(--nl-russet))",
                    }}
                  >
                    {t(method.reason_key as any, reasonValues(method.reason_params))}
                  </div>
                )}
              </div>
            </MaisonTile>
          );
        })}
      </div>

      {/* Tab content */}
      {paymentMethod === "card" && (
        <div>
          {onExpressCheckoutConfirm && grandTotalFils > 0 && (
            <div
              className="mb-3"
              style={{
                padding: "14px",
                border: "1px solid rgba(15,18,24,0.16)",
                background: "rgba(255,255,255,0.55)",
              }}
            >
              <ExpressCheckoutElement
                onConfirm={onExpressCheckoutConfirm}
                options={{
                  buttonHeight: 44,
                  buttonTheme: {
                    applePay: "black",
                  },
                  buttonType: {
                    applePay: "check-out",
                  },
                  layout: {
                    maxColumns: 1,
                    maxRows: 1,
                    overflow: "never",
                  },
                  paymentMethods: {
                    amazonPay: "never",
                    applePay: "auto",
                    googlePay: "never",
                    link: "never",
                    paypal: "never",
                  },
                }}
              />
            </div>
          )}

          {savedCards.length > 0 && (
            <div className="mb-3 space-y-2">
              {savedCards.map((card) => (
                <div
                  key={card.id}
                  className={`flex items-center justify-between text-sm ${card.is_expired ? "opacity-40" : ""}`}
                  style={{
                    padding: "10px 14px",
                    border: "1px solid rgba(15,18,24,0.16)",
                    background: "rgba(255,255,255,0.55)",
                  }}
                >
                  <span
                    className="capitalize"
                    style={{
                      fontFamily: MAISON_SERIF,
                      fontSize: 15,
                      color: "hsl(var(--nl-cacao))",
                    }}
                  >
                    {card.brand} •••• {card.last4}
                  </span>
                  <span
                    className="uppercase"
                    style={{
                      fontSize: 10,
                      letterSpacing: "0.18em",
                      color: "hsl(var(--nl-russet))",
                    }}
                  >
                    {card.exp_month}/{card.exp_year}
                    {card.is_expired && ` · ${t("expired")}`}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div
            style={{
              padding: "14px 14px 12px",
              border: "1px solid rgba(15,18,24,0.16)",
              background: "rgba(255,255,255,0.55)",
            }}
          >
            <div
              className="uppercase mb-1.5 flex items-center justify-between"
              style={{
                fontSize: 9,
                letterSpacing: "0.22em",
                color: "hsl(var(--nl-russet))",
              }}
            >
              <span>{t("cardNumberLabel")}</span>
              <Lock
                className="h-3.5 w-3.5"
                strokeWidth={1.25}
                style={{ color: "hsl(var(--nl-amber))" }}
              />
            </div>
            <CardElement
              options={{
                hidePostalCode: true,
                style: {
                  base: {
                    fontSize: "16px",
                    fontFamily: "var(--font-display), 'Inter Tight', system-ui, sans-serif",
                    color: "#13161D",
                    "::placeholder": { color: "rgba(15,18,24,0.55)" },
                  },
                  invalid: { color: "#ef4444" },
                },
              }}
            />
          </div>
        </div>
      )}

      {paymentMethod === "cod" &&
        (() => {
          const codMethod = paymentMethods.find((m) => m.id === "cod");
          return (
            <div
              style={{
                padding: "14px 16px",
                border: "1px solid rgba(15,18,24,0.16)",
                background: "rgba(255,255,255,0.55)",
              }}
            >
              <p className="text-sm" style={{ color: "hsl(var(--nl-cacao))" }}>
                {t("codConfirm")}
              </p>
              {codMethod && codMethod.surcharge_fils > 0 && (
                <p className="text-xs mt-1" style={{ color: "hsl(var(--nl-russet))" }}>
                  {t("payment.cod.surcharge" as any, {
                    amount: filsToAed(codMethod.surcharge_fils),
                  })}
                </p>
              )}
            </div>
          );
        })()}

      {paymentMethod === "tamara" &&
        (() => {
          const installments = 4;
          return (
            <div
              style={{
                padding: "14px 16px",
                border: "1px solid rgba(15,18,24,0.16)",
                background: "rgba(255,255,255,0.55)",
              }}
            >
              <p className="text-sm" style={{ color: "hsl(var(--nl-cacao))" }}>
                {t("tamaraInfo")}
              </p>
              {grandTotalFils > 0 && (
                <p
                  className="mt-1"
                  style={{
                    fontFamily: MAISON_SERIF,
                    fontSize: 14,
                    color: "hsl(var(--nl-amber-text))",
                  }}
                >
                  {t("bnplPlan", {
                    installments,
                    amount: filsToAed(Math.round(grandTotalFils / installments)),
                  })}
                </p>
              )}
            </div>
          );
        })()}

      {paymentMethod &&
        (() => {
          const current = paymentMethods.find((m) => m.id === paymentMethod);
          if (current && !current.available && current.reason_key) {
            return (
              <p
                className="mt-2 text-xs"
                style={{
                  color: "hsl(var(--destructive))",
                  fontFamily: MAISON_SANS,
                }}
              >
                {t(current.reason_key as any, reasonValues(current.reason_params))}
              </p>
            );
          }
          return null;
        })()}
    </MaisonCard>
  );
}
