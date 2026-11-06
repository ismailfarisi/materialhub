"use client";

import { NetTermsDetails, NetTermsIcon, NetTermsOptionText } from "@/components/business/checkout-business";
import { filsToAed } from "@/lib/money";
import { usePaymentInstruments } from "@/lib/queries/checkout-quote";
import type { CheckoutQuotePaymentMethod } from "@/lib/queries/checkout-quote";
import { cn } from "@/lib/utils";
import { type PaymentMethod, useCheckoutStore } from "@/stores/checkout";
import { CardElement, ExpressCheckoutElement } from "@stripe/react-stripe-js";
import { AlertCircle, Banknote, CreditCard, Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Notice, OptionTile, Panel } from "./checkout-ui";
import { swatchCardStyle } from "./stripe-appearance";

type TFn = ReturnType<typeof useTranslations<"checkout">>;
// Reason keys come from the quote, so they are dynamic.
type DynamicKey = Parameters<TFn>[0];

// Reason templates ("between {min} and {max} AED") take values from the
// quote's typed reason_params — money values arrive in fils.
function reasonValues(params?: Record<string, unknown>): Record<string, string | number> {
	return Object.fromEntries(
		Object.entries(params ?? {}).map(([k, v]) => {
			const p = v as { type?: string; value?: string | number } | null;
			return [k, p?.type === "money" ? filsToAed(Number(p.value)) : (p?.value ?? "")];
		}),
	);
}

interface PaymentSectionProps {
	onExpressCheckoutConfirm?: Parameters<typeof ExpressCheckoutElement>[0]["onConfirm"];
}

/** Step 3: payment method and its details. */
export function PaymentSection({ onExpressCheckoutConfirm }: PaymentSectionProps) {
	const t = useTranslations("checkout");
	const { quoteData, paymentMethod, setPaymentMethod } = useCheckoutStore();
	const { data: instrumentsData } = usePaymentInstruments();
	const [cardError, setCardError] = useState<string | null>(null);
	const [cardFocused, setCardFocused] = useState(false);
	const cardStyle = useMemo(() => swatchCardStyle(), []);

	const paymentMethods = (quoteData?.payment_methods ?? []).filter((method) => method.id !== "tabby");
	const savedCards = instrumentsData?.instruments ?? [];
	const grandTotalFils = quoteData?.totals.grand_total_fils ?? 0;
	const current = paymentMethods.find((m) => m.id === paymentMethod);
	const noMethods = quoteData?.blocking_error?.code === "no_eligible_payment_methods";

	const methodName = (id: string) =>
		id === "card" ? t("methodCard") : id === "cod" ? t("methodCod") : id === "tamara" ? "Tamara" : id;
	const methodHint = (id: string) =>
		id === "card" ? t("methodCardHint") : id === "cod" ? t("codDesc") : id === "tamara" ? t("tamaraInfo") : "";

	return (
		<Panel id="checkout-payment" step={3} title={t("paymentTitle")}>
			<div className="grid gap-4">
				{noMethods && quoteData?.blocking_error && (
					<Notice tone="error">{t(quoteData.blocking_error.i18n_key.replace(/^checkout\./, "") as DynamicKey)}</Notice>
				)}

				{quoteData === null ? (
					<div className="grid gap-2 animate-pulse motion-reduce:animate-none" aria-hidden="true">
						{[0, 1, 2].map((i) => (
							<div key={i} className="h-14 rounded-md bg-nl-cacao/[0.06]" />
						))}
					</div>
				) : (
					<div role="radiogroup" aria-label={t("paymentMethodLabel")} className="grid gap-2">
						{paymentMethods.map((method: CheckoutQuotePaymentMethod) => {
							const Icon = method.id === "cod" ? Banknote : method.id === "net_terms" ? NetTermsIcon : CreditCard;
							return (
								<OptionTile
									key={method.id}
									name="payment-method"
									value={method.id}
									checked={paymentMethod === method.id}
									disabled={!method.available}
									onSelect={() => method.available && setPaymentMethod(method.id as PaymentMethod)}
								>
									<span className="flex items-center gap-3">
										{method.id === "net_terms" ? <NetTermsOptionText method={method} /> : <span className="grid min-w-0 flex-1">
											<span className="font-medium text-nl-cacao">{methodName(method.id)}</span>
											<span className="text-[13px] text-nl-russet">
												{!method.available && method.reason_key
													? t(method.reason_key as DynamicKey, reasonValues(method.reason_params))
													: methodHint(method.id)}
											</span>
										</span>}
										{method.id === "tamara" ? (
											<img src="/tamara-logo.png" alt="" className="h-5 w-auto shrink-0 object-contain" />
										) : (
											<Icon className="h-5 w-5 shrink-0 text-nl-cacao" strokeWidth={1.75} aria-hidden="true" />
										)}
									</span>
								</OptionTile>
							);
						})}
					</div>
				)}

				{paymentMethod === "card" && quoteData !== null && (
					<div className="grid gap-4 border-t border-nl-cacao/10 pt-4">
						{onExpressCheckoutConfirm && grandTotalFils > 0 && (
							<div className="grid gap-3">
								<ExpressCheckoutElement
									onConfirm={onExpressCheckoutConfirm}
									options={{
										buttonHeight: 44,
										buttonTheme: { applePay: "black" },
										buttonType: { applePay: "check-out" },
										layout: { maxColumns: 1, maxRows: 1, overflow: "never" },
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
							<div className="grid gap-1.5">
								<p className="m-0 text-[13px] font-medium text-nl-cacao">{t("savedCards")}</p>
								<ul className="m-0 grid list-none gap-1.5 p-0">
									{savedCards.map((card) => (
										<li
											key={card.id}
											className={cn(
												"flex items-center justify-between gap-3 rounded-md border border-nl-cacao/15 bg-nl-linen/50 px-3.5 py-2.5 text-[14px]",
												card.is_expired && "text-nl-russet",
											)}
										>
											<span className="capitalize">
												{card.brand} <span className="font-mono tabular-nums">•••• {card.last4}</span>
											</span>
											<span className="font-mono text-[12.5px] tabular-nums text-nl-russet">
												{String(card.exp_month).padStart(2, "0")}/{card.exp_year}
												{card.is_expired && ` · ${t("expired")}`}
											</span>
										</li>
									))}
								</ul>
							</div>
						)}

						<div className="grid gap-1.5">
							<span id="card-details-label" className="flex items-center justify-between text-[13px] font-medium text-nl-cacao">
								{t("cardNumberLabel")}
								<span className="inline-flex items-center gap-1 text-[12px] font-normal text-nl-russet">
									<Lock className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
									{t("cardSecureHint")}
								</span>
							</span>
							<div
								aria-labelledby="card-details-label"
								className={cn(
									"rounded-md border bg-nl-pearl px-3.5 py-[13px] transition-[border-color,box-shadow] duration-150",
									cardError
										? "border-destructive"
										: cardFocused
											? "border-nl-cacao shadow-[0_0_0_2px_hsl(var(--nl-amber)/0.9)]"
											: "border-nl-cacao/20 hover:border-nl-cacao/40",
								)}
							>
								<CardElement
									options={{ hidePostalCode: true, style: cardStyle }}
									onFocus={() => setCardFocused(true)}
									onBlur={() => setCardFocused(false)}
									onChange={(e) => setCardError(e.error?.message ?? null)}
								/>
							</div>
							{cardError && (
								<p role="alert" className="m-0 flex items-start gap-1.5 text-[13px] text-destructive">
									<AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
									{cardError}
								</p>
							)}
						</div>
					</div>
				)}

				{paymentMethod === "cod" && current && (
					<div className="grid gap-1 border-t border-nl-cacao/10 pt-4 text-[14px]">
						<p className="m-0 text-nl-cacao">{t("codConfirm")}</p>
						{current.surcharge_fils > 0 && (
							<p className="m-0 text-[13px] text-nl-russet tabular-nums">
								{t("payment.cod.surcharge", { amount: filsToAed(current.surcharge_fils) })}
							</p>
						)}
					</div>
				)}

				{paymentMethod === "tamara" && current?.available && (
					<div className="grid gap-1 border-t border-nl-cacao/10 pt-4 text-[14px]">
						{grandTotalFils > 0 && (
							<p className="m-0 font-medium text-nl-cacao tabular-nums">
								{t("bnplPlan", { installments: 4, amount: filsToAed(Math.round(grandTotalFils / 4)) })}
							</p>
						)}
						<p className="m-0 text-[13px] text-nl-russet">{t("tamaraRedirect")}</p>
					</div>
				)}

				{paymentMethod === "net_terms" && current && <NetTermsDetails method={current} />}

				{current && !current.available && current.reason_key && current.id !== "net_terms" && (
					<p className="m-0 text-[13px] text-destructive">
						{t(current.reason_key as DynamicKey, reasonValues(current.reason_params))}
					</p>
				)}
			</div>
		</Panel>
	);
}
