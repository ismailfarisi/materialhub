"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";
import type { TradeViolationCode, Unit } from "./trade-terms";

type TradeT = ReturnType<typeof useTranslations<"trade">>;
type Key = Parameters<TradeT>[0];

/** Unit names and counted quantities ("50 sheets", "٣ أوراق") in the page locale. */
export function useTradeLabels() {
	const t = useTranslations("trade");
	const unitName = useCallback(
		(unit: Unit | null | undefined) => t(`units.${unit ?? "unit"}` as Key),
		[t],
	);
	const count = useCallback(
		(unit: Unit | null | undefined, n: number) =>
			t(`counts.${unit ?? "unit"}` as Key, { count: n }),
		[t],
	);
	const violation = useCallback(
		(
			code: TradeViolationCode,
			v: {
				unit: Unit | null;
				suggested: number;
				minOrderQuantity: number;
				orderIncrement: number;
				maxQuantity: number | null;
			},
		) => {
			if (code === "MIN_ORDER_QUANTITY")
				return t("violations.MIN_ORDER_QUANTITY", {
					quantity: count(v.unit, v.minOrderQuantity),
				});
			if (code === "SAMPLE_QUANTITY_CAP")
				return t("violations.SAMPLE_QUANTITY_CAP", {
					count: v.maxQuantity ?? v.suggested,
				});
			return t("violations.ORDER_INCREMENT", {
				step: v.orderIncrement,
				quantity: count(v.unit, v.suggested),
			});
		},
		[t, count],
	);
	return { t, unitName, count, violation };
}
