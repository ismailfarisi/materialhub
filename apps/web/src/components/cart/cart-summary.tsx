"use client";

import { Button, PriceTag } from "@/components/swatch";
import { ArrowRight, Lock } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { FreeShippingMeter } from "./free-shipping-meter";

/** Cart page order summary: free-shipping meter, totals, the one Check out button. */
export function CartSummary({
	subtotalFils,
	hasUnavailable,
}: {
	subtotalFils: number;
	hasUnavailable: boolean;
}) {
	const t = useTranslations("cart");
	const locale = useLocale();

	return (
		<section
			aria-labelledby="cart-summary-title"
			className="grid gap-5 rounded-md bg-nl-pearl p-5 shadow-card sm:p-6"
		>
			<h2 id="cart-summary-title" className="m-0 font-display text-lg font-semibold tracking-[-0.01em] text-nl-cacao">
				{t("summaryTitle")}
			</h2>

			<FreeShippingMeter subtotalFils={subtotalFils} />

			<dl className="m-0 grid gap-2.5 text-[14px]">
				<div className="flex items-baseline justify-between gap-4">
					<dt className="text-nl-cacao">{t("subtotal")}</dt>
					<dd className="m-0">
						<PriceTag amount={subtotalFils} locale={locale} size="sm" />
					</dd>
				</div>
				<div className="flex items-baseline justify-between gap-4 text-nl-russet">
					<dt>{t("shipping")}</dt>
					<dd className="m-0 text-end">{t("shippingAtCheckout")}</dd>
				</div>
				<div className="flex items-baseline justify-between gap-4 text-nl-russet">
					<dt>{t("vat")}</dt>
					<dd className="m-0">{t("included")}</dd>
				</div>
			</dl>

			<div className="flex items-baseline justify-between gap-4 border-t-2 border-nl-cacao pt-4">
				<span className="font-medium text-nl-cacao">{t("estimatedTotal")}</span>
				<PriceTag amount={subtotalFils} locale={locale} size="lg" />
			</div>

			{hasUnavailable && (
				<p role="alert" className="m-0 text-[13px] text-destructive">
					{t("removeUnavailable")}
				</p>
			)}

			<Button asChild variant="signal" size="lg" className="w-full">
				<Link href={`/${locale}/checkout`}>
					{t("checkoutCta")}
					<ArrowRight className="h-4 w-4 rtl:rotate-180" strokeWidth={1.75} aria-hidden="true" />
				</Link>
			</Button>

			<p className="m-0 flex items-start gap-2 text-[12.5px] leading-relaxed text-nl-russet">
				<Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
				{t("paymentNote")}
			</p>
		</section>
	);
}
