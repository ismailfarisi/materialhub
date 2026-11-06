"use client";

import { Button, formatFils } from "@/components/swatch";
import { useAddToCart, useCart } from "@/lib/queries/cart";
import { useCartStore } from "@/stores/cart";
import { useLocale } from "next-intl";
import { type SampleOffer, tradeErrorOf } from "./trade-terms";
import { useTradeLabels } from "./use-trade-labels";

/**
 * "Order a sample": adds the product's sample variant, one at a time up to its
 * cap. Outline, never orange: Add to cart stays the one next action.
 */
export function SampleAction({
	productId,
	sample,
}: { productId: string; sample: SampleOffer }) {
	const locale = useLocale();
	const { t, violation } = useTradeLabels();
	const addToCart = useAddToCart();
	const { openSlideOver } = useCartStore();
	const { data: cart } = useCart();

	// biome-ignore lint/suspicious/noExplicitAny: cart lines are mapped loosely in useCart
	const inCart =
		(cart?.items as any[] | undefined)?.find(
			(i) => i.variant_id === sample.variantId,
		)?.quantity ?? 0;
	const atCap = inCart >= sample.maxQuantity;
	const soldOut = sample.available <= inCart;
	const price =
		sample.price === 0
			? t("sampleFree")
			: `AED ${formatFils(sample.price, locale)}`;

	const tradeErr = tradeErrorOf(addToCart.error);
	const error = addToCart.isError
		? tradeErr
			? violation(tradeErr.code, { unit: null, ...tradeErr })
			: t("sampleFailed")
		: null;

	return (
		<div className="grid gap-1.5">
			<Button
				variant="outline"
				size="md"
				className="justify-between"
				disabled={addToCart.isPending || atCap || soldOut}
				onClick={() =>
					addToCart.mutate(
						{ productId, variantId: sample.variantId, quantity: inCart + 1 },
						{ onSuccess: () => openSlideOver() },
					)
				}
			>
				<span>
					{soldOut
						? t("sampleOut")
						: atCap
							? t("sampleInCart")
							: t("orderSample")}
				</span>
				<span className="font-mono text-[13px] tabular-nums text-nl-russet [unicode-bidi:isolate]">
					{price}
				</span>
			</Button>
			<p className="m-0 text-[12.5px] text-nl-russet">
				{t("sampleNote", { count: sample.maxQuantity })}
			</p>
			{error && (
				<p role="alert" className="m-0 text-[13px] text-destructive">
					{error}
				</p>
			)}
		</div>
	);
}
