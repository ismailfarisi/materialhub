"use client";

import { formatFils } from "@/components/swatch";
import { cn } from "@/lib/utils";
import { useLocale, useTranslations } from "next-intl";
import { type OptionAxis, type PdpVariant, axisValue, pickVariant } from "./pdp-data";

/** Values that carry a measurement ("350 gsm", "70 × 100 cm") read in mono. */
const isMeasured = (v: string) => /\d/.test(v);

/**
 * Variant options as swatch chips: one row per option axis (size, grammage,
 * colour…). Colour values with a real hex or swatch image render as colour
 * squares; everything else as 2px-radius chips. With a single axis each chip
 * also shows that variant's price, so sizes compare at a glance.
 */
export function VariantSelector({
	axes,
	variants,
	selected,
	onSelect,
}: {
	axes: OptionAxis[];
	variants: PdpVariant[];
	selected: PdpVariant | undefined;
	onSelect: (variant: PdpVariant) => void;
}) {
	const t = useTranslations("pdp");
	const locale = useLocale();
	if (axes.length === 0) return null;
	const single = axes.length === 1;

	return (
		<div className="grid gap-5">
			{axes.map((axis) => {
				const current = selected ? axisValue(axis, selected) : undefined;
				const isColourAxis = axis.values.every((v) => v.hex || v.image);
				return (
					<fieldset key={axis.key} className="m-0 min-w-0 border-0 p-0">
						<legend className="mb-2.5 p-0 text-[13px] font-medium text-nl-cacao">
							<span className="flex flex-wrap items-baseline gap-x-2">
								<span>{axis.label}</span>
								{current && (
									<bdi className={cn("font-normal text-nl-russet", isMeasured(current) && "font-mono text-[12.5px]")}>
										{current}
									</bdi>
								)}
							</span>
						</legend>
						<div className="flex flex-wrap gap-2">
							{axis.values.map((opt) => {
								const target = pickVariant(variants, axes, selected, axis, opt.value);
								const isSelected = current === opt.value;
								const soldOut = target ? target.available <= 0 : true;
								const label = soldOut ? `${opt.value} (${t("soldOut")})` : opt.value;

								if (isColourAxis) {
									return (
										<button
											key={opt.value}
											type="button"
											aria-pressed={isSelected}
											aria-label={label}
											title={label}
											onClick={() => target && onSelect(target)}
											className={cn(
												"relative h-10 w-10 shrink-0 rounded-sm bg-nl-linen bg-cover bg-center",
												"ring-1 ring-inset ring-black/15 transition-[outline-color] duration-150",
												"outline outline-2 outline-offset-2",
												isSelected ? "outline-nl-cacao" : "outline-transparent hover:outline-nl-cacao/30",
												"focus-visible:outline-nl-amber",
											)}
											style={{
												backgroundColor: opt.hex ?? undefined,
												backgroundImage: opt.image ? `url(${opt.image})` : undefined,
											}}
										>
											{soldOut && <SoldOutStrike />}
										</button>
									);
								}

								const price = single && target ? target.price : null;
								return (
									<button
										key={opt.value}
										type="button"
										aria-pressed={isSelected}
										aria-label={label}
										onClick={() => target && onSelect(target)}
										className={cn(
											"relative grid min-h-10 min-w-[2.75rem] content-center gap-0.5 rounded-sm border px-3 py-2 text-start",
											"transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nl-amber",
											isSelected
												? "border-nl-cacao bg-nl-cacao text-white"
												: "border-nl-cacao/20 bg-nl-pearl text-nl-cacao hover:border-nl-cacao/60",
											soldOut && !isSelected && "border-dashed text-nl-russet",
										)}
									>
										<span dir="auto" className={cn("leading-tight", isMeasured(opt.value) ? "font-mono text-[13px] tabular-nums" : "text-[13.5px]", soldOut && "line-through decoration-1")}>
											{opt.value}
										</span>
										{price != null && (
											<span className={cn("font-mono text-[11.5px] tabular-nums", isSelected ? "text-white/75" : "text-nl-russet")}>
												{soldOut ? t("soldOut") : `AED ${formatFils(price, locale)}`}
											</span>
										)}
									</button>
								);
							})}
						</div>
					</fieldset>
				);
			})}
		</div>
	);
}

function SoldOutStrike() {
	return (
		<span aria-hidden="true" className="absolute inset-0 overflow-hidden rounded-sm">
			<span className="absolute left-1/2 top-[-20%] h-[140%] w-px -translate-x-1/2 rotate-45 bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.35)]" />
		</span>
	);
}
