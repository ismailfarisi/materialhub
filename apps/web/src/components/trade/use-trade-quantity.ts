"use client";

import type { PdpVariant } from "@/components/product/pdp-data";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
	maxValidQuantity,
	sampleOffer,
	simpleProductAvailable,
	snapUp,
	stepQuantity,
	tradeErrorOf,
	tradeTermsFor,
	unitPriceFor,
} from "./trade-terms";
import { useTradeLabels } from "./use-trade-labels";

/** Steps offered when stock isn't tracked. */
const UNTRACKED_STEPS = 999;

/**
 * Product-page quantity under trade terms: starts at the minimum order, moves
 * in increments, stays within stock, and prices at the tier it reaches.
 */
// biome-ignore lint/suspicious/noExplicitAny: untyped API response shape
export function useTradeQuantity(
	product: any,
	selected: PdpVariant | undefined,
) {
	const t = useTranslations("trade");
	const { unitName, violation } = useTradeLabels();
	const terms = useMemo(
		() => tradeTermsFor(product, selected?.id),
		[product, selected?.id],
	);
	const sample = useMemo(() => sampleOffer(product), [product]);
	const simpleAvailable = useMemo(
		() => simpleProductAvailable(product),
		[product],
	);

	const available: number = selected
		? selected.available
		: (simpleAvailable ??
			Number(product.quantity_available ?? Number.POSITIVE_INFINITY));
	const productOutOfStock =
		!selected && simpleAvailable != null
			? simpleAvailable <= 0
			: product.in_stock === false || (product.quantity_available ?? 1) <= 0;

	const limited = Number.isFinite(available) && available > 0;
	const maxValid = limited
		? maxValidQuantity(terms, available)
		: maxValidQuantity(
				terms,
				terms.minOrderQuantity + UNTRACKED_STEPS * terms.orderIncrement,
			);
	const belowMinimum = limited && maxValid == null;
	const maxQty = maxValid ?? terms.minOrderQuantity;

	const clamp = useCallback(
		(q: number) => Math.min(maxQty, snapUp(terms, q)),
		[maxQty, terms],
	);
	const [quantity, setRaw] = useState(terms.minOrderQuantity);
	useEffect(() => {
		setRaw((q) => clamp(q));
	}, [clamp]);

	const setQuantity = useCallback((q: number) => setRaw(clamp(q)), [clamp]);
	const step = useCallback(
		(dir: 1 | -1) => setRaw((q) => stepQuantity(terms, q, dir, maxQty)),
		[terms, maxQty],
	);

	const errorMessage = useCallback(
		(err: unknown) => {
			const e = tradeErrorOf(err);
			return e ? violation(e.code, { unit: terms.unit, ...e }) : null;
		},
		[terms.unit, violation],
	);

	return {
		terms,
		sample,
		quantity,
		setQuantity,
		step,
		commit: setQuantity,
		unitPrice: unitPriceFor(terms, quantity),
		unitLabel: terms.unit ? unitName(terms.unit) : null,
		available,
		maxQty,
		productOutOfStock,
		belowMinimum,
		belowMinimumNote: t("belowMinimum", { count: available }),
		errorMessage,
	};
}
