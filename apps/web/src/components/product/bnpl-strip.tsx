"use client";

import { formatFils } from "@/components/swatch";
import { useBnplThresholds } from "@/lib/queries/bnpl";
import { cn } from "@/lib/utils";
import { useLocale, useTranslations } from "next-intl";

interface BnplStripProps {
	total_fils: number;
	className?: string;
}

const INSTALLMENTS = 4;

/** Tamara instalment line under the buy button, shown only inside Tamara's limits. */
export function BnplStrip({ total_fils, className }: BnplStripProps) {
	const t = useTranslations("pdp");
	const locale = useLocale();
	const { data: thresholdsData } = useBnplThresholds();

	// Fallback to a default Tamara threshold if the API is offline or has no records.
	const thresholds =
		thresholdsData && thresholdsData.length > 0
			? thresholdsData
			: [{ provider: "tamara" as const, min_amount_fils: 0, max_amount_fils: 10000000 }];

	const eligible = thresholds.find(
		(th) => th.provider === "tamara" && total_fils >= th.min_amount_fils && total_fils <= th.max_amount_fils,
	);
	if (!eligible || total_fils <= 0) return null;

	const per = Math.round(total_fils / INSTALLMENTS);

	return (
		<div className={cn("flex items-center justify-between gap-4 rounded-md border border-nl-cacao/12 bg-nl-pearl px-4 py-3", className)}>
			<p className="m-0 text-[13px] leading-snug text-nl-cacao">
				{t.rich("bnpl", {
					amount: `AED ${formatFils(per, locale)}`,
					b: (chunks) => <span className="font-mono font-medium tabular-nums">{chunks}</span>,
				})}
			</p>
			<img src="/tamara-logo.png" alt="Tamara" className="h-6 w-auto shrink-0 object-contain" />
		</div>
	);
}
