"use client";

import { formatFils } from "@/components/swatch";
import { cn } from "@/lib/utils";
import { useLocale } from "next-intl";
import { type TradeTerms, activeTier, breakRows } from "./trade-terms";
import { useTradeLabels } from "./use-trade-labels";

/**
 * Quantity-break table, printed like a mill label: 2px ink rule, condensed
 * caps headers, mono tabular values. The band the current quantity falls in is
 * raised to stock white with an orange marker; each band's quantity sets the
 * stepper to that band's start.
 */
export function QuantityBreaks({
	terms,
	quantity,
	onSelect,
	max,
	className,
}: {
	terms: TradeTerms;
	quantity: number;
	onSelect: (quantity: number) => void;
	/** Highest quantity that can be ordered (stock); bands above it are not offered as buttons. */
	max?: number;
	className?: string;
}) {
	const locale = useLocale();
	const { t, unitName } = useTradeLabels();
	const rows = breakRows(terms);
	if (rows.length === 0) return null;
	const current =
		activeTier(terms, quantity)?.min_quantity ?? terms.minOrderQuantity;
	const unit = unitName(terms.unit);

	return (
		<section
			aria-labelledby="trade-breaks"
			className={cn("grid gap-2", className)}
		>
			<h2 id="trade-breaks" className="mill-label m-0 text-nl-cacao">
				{t("breaksTitle")}
			</h2>
			<table className="w-full border-collapse border-t-2 border-nl-cacao text-[13.5px]">
				<thead>
					<tr>
						<th
							scope="col"
							className="mill-label py-2 pe-3 text-start font-semibold text-nl-russet"
						>
							{t("colQuantity")}
						</th>
						<th
							scope="col"
							className="mill-label py-2 pe-3 text-end font-semibold text-nl-russet"
						>
							{t("colUnitPrice")}
						</th>
						<th
							scope="col"
							className="mill-label py-2 text-end font-semibold text-nl-russet"
						>
							{t("colSaving")}
						</th>
					</tr>
				</thead>
				<tbody>
					{rows.map((r) => {
						const active = r.from === current;
						const reachable = max == null || r.from <= max;
						const range =
							r.to == null
								? t("rangeOpen", { from: r.from })
								: t("range", { from: r.from, to: r.to });
						return (
							<tr
								key={r.from}
								aria-current={active ? "true" : undefined}
								className={cn(
									"border-b border-nl-cacao/12 transition-colors",
									active
										? "bg-nl-pearl font-semibold text-nl-cacao"
										: "text-nl-cacao",
								)}
							>
								<td className="py-0 pe-3">
									<button
										type="button"
										onClick={() => onSelect(r.from)}
										disabled={!reachable || active}
										aria-label={t("setQuantity", {
											quantity: `${range} ${unit}`,
										})}
										className="-ms-1 inline-flex min-h-10 items-center gap-2 rounded-sm px-1 font-mono tabular-nums underline-offset-4 enabled:hover:underline disabled:cursor-default focus-visible:outline focus-visible:outline-2 focus-visible:outline-nl-amber"
									>
										<span
											aria-hidden="true"
											className={cn(
												"h-2 w-2 shrink-0 rounded-[2px]",
												active ? "bg-nl-amber" : "bg-transparent",
											)}
										/>
										{/* "50–99" must stay left-to-right; "500 فأكثر" takes its own direction. */}
										<bdi dir={r.to == null ? undefined : "ltr"}>{range}</bdi>
									</button>
									{active && (
										<span className="sr-only"> · {t("yourPrice")}</span>
									)}
								</td>
								<td className="py-2 pe-3 text-end font-mono tabular-nums">
									<span className="[unicode-bidi:isolate]">
										<span className="text-[11.5px] font-normal text-nl-russet">
											AED{" "}
										</span>
										{formatFils(r.unitPrice, locale)}
									</span>
								</td>
								<td className="py-2 text-end font-mono tabular-nums text-nl-russet">
									{r.savingPct > 0 ? <bdi dir="ltr">−{r.savingPct}%</bdi> : "—"}
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</section>
	);
}
