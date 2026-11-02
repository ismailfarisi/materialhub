"use client";

import { Button, formatFils } from "@/components/swatch";
import { useApplyCoupon, useAvailableCoupons, useRemoveCoupon } from "@/lib/queries/checkout";
import { useCheckoutStore } from "@/stores/checkout";
import { AlertCircle, Loader2, Tag, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

interface CouponSectionProps {
	/** Called after the coupon changes on the cart so the quote can refetch. */
	onChanged?: () => void | Promise<void>;
}

/** Offer code entry, applied code chip and suggested offers. */
export function CouponSection({ onChanged }: CouponSectionProps) {
	const t = useTranslations("checkout");
	const locale = useLocale();
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
		} catch (err: unknown) {
			const e = err as { response?: { data?: { message?: string } } };
			setError(e.response?.data?.message || t("couponFailed"));
			setCoupon("", 0);
		} finally {
			setLoading(false);
		}
	}

	function offerLabel(c: { type: string; discount: number }) {
		if (c.type === "free_shipping") return t("freeShipping");
		return `−AED ${formatFils(c.discount, locale)}`;
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
		<section aria-labelledby="checkout-offer-title" className="rounded-md bg-nl-pearl px-4 py-4 shadow-card sm:px-6">
			<h2 id="checkout-offer-title" className="m-0 mb-3 text-[14px] font-medium text-nl-cacao">
				{t("offerCode")}
			</h2>
			{isApplied ? (
				<div className="flex items-center gap-2.5 rounded-md border border-nl-cacao bg-nl-linen/50 py-1.5 pe-1.5 ps-3.5">
					<Tag className="h-4 w-4 shrink-0 text-nl-cacao" strokeWidth={1.75} aria-hidden="true" />
					<span className="font-mono text-[13.5px] uppercase tabular-nums text-nl-cacao">{appliedCode}</span>
					{appliedDiscount > 0 && (
						<span dir="ltr" className="text-[13.5px] tabular-nums text-nl-russet">
							−AED {formatFils(appliedDiscount, locale)}
						</span>
					)}
					<Button
						variant="ghost"
						size="icon"
						onClick={handleRemove}
						disabled={loading}
						className="ms-auto h-9 w-9"
						aria-label={t("removeCoupon")}
					>
						{loading ? (
							<Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
						) : (
							<X className="h-4 w-4" strokeWidth={1.75} />
						)}
					</Button>
				</div>
			) : (
				<form
					className="flex gap-2"
					onSubmit={(e) => {
						e.preventDefault();
						handleApply();
					}}
				>
					<label htmlFor="checkout-offer-code" className="sr-only">
						{t("offerCode")}
					</label>
					<input
						id="checkout-offer-code"
						type="text"
						value={input}
						onChange={(e) => setInput(e.target.value)}
						autoComplete="off"
						autoCapitalize="characters"
						spellCheck={false}
						aria-invalid={!!error || undefined}
						aria-describedby={error ? "checkout-offer-error" : undefined}
						className="h-11 min-w-0 flex-1 rounded-md border border-nl-cacao/20 bg-nl-pearl px-3.5 font-mono text-[14px] uppercase text-nl-cacao outline-none transition-colors placeholder:normal-case placeholder:font-sans placeholder:text-nl-russet hover:border-nl-cacao/40 focus:border-nl-cacao focus-visible:shadow-[0_0_0_2px_hsl(var(--nl-amber)/0.9)] aria-[invalid=true]:border-destructive"
					/>
					<Button type="submit" variant="outline" disabled={loading || !input?.trim()}>
						{loading ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
						{t("applyCoupon")}
					</Button>
				</form>
			)}
			{error && (
				<p id="checkout-offer-error" role="alert" className="m-0 mt-2 flex items-start gap-1.5 text-[13px] text-destructive">
					<AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
					{error}
				</p>
			)}
			{!isApplied && (availableCoupons?.length ?? 0) > 0 && (
				<div className="mt-3 grid gap-1.5">
					<p className="m-0 text-[13px] text-nl-russet">{t("availableCoupons")}</p>
					<div className="flex flex-wrap gap-1.5">
						{availableCoupons?.map((c) => (
							<button
								key={c.code}
								type="button"
								onClick={() => handleApply(c.code)}
								disabled={loading}
								title={c.name}
								className="inline-flex h-8 items-center gap-2 rounded-sm border border-dashed border-nl-cacao/40 bg-nl-pearl px-2.5 text-[13px] text-nl-cacao transition-colors hover:border-nl-cacao hover:bg-nl-linen/60 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-nl-amber"
							>
								<span className="font-mono uppercase tabular-nums">{c.code}</span>
								<span dir="ltr" className="tabular-nums text-nl-russet">{offerLabel(c)}</span>
							</button>
						))}
					</div>
				</div>
			)}
		</section>
	);
}
