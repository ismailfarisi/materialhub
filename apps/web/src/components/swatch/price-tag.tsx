import { cn } from "@/lib/utils";

export function formatFils(amountInFils: number, locale: string, fraction = 2): string {
	const whole = amountInFils % 100 === 0;
	return new Intl.NumberFormat(locale === "ar" ? "ar-AE" : "en-AE", {
		minimumFractionDigits: whole ? 0 : fraction,
		maximumFractionDigits: whole ? 0 : fraction,
	}).format(amountInFils / 100);
}

/**
 * Price with its unit. Every price on MaterialHub names what it buys:
 * "AED 4.80 / sheet". `from` marks the lowest tier or variant.
 */
export function PriceTag({
	amount,
	locale,
	currency = "AED",
	unit,
	from = false,
	compareAt,
	max,
	size = "md",
	fromLabel = "from",
	className,
}: {
	amount: number;
	locale: string;
	currency?: string;
	unit?: string | null;
	from?: boolean;
	compareAt?: number | null;
	max?: number | null;
	size?: "sm" | "md" | "lg";
	/** Translated word for `from` (pass `t("from")` on localized pages). */
	fromLabel?: string;
	className?: string;
}) {
	const big = { sm: "text-base", md: "text-lg", lg: "text-[28px]" }[size];
	return (
		<span className={cn("inline-flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 tabular-nums [unicode-bidi:isolate]", className)}>
			{from && <span className="text-[12.5px] text-nl-russet">{fromLabel}</span>}
			<span className="text-[12.5px] font-medium text-nl-russet">{currency}</span>
			<span className={cn("font-display font-semibold leading-none text-nl-cacao tracking-[-0.01em]", big)}>
				{formatFils(amount, locale)}
			</span>
			{max != null && max > amount && (
				<span className="text-[13px] text-nl-russet">– {formatFils(max, locale)}</span>
			)}
			{unit && <span className="text-[12.5px] text-nl-russet">/ {unit}</span>}
			{compareAt != null && compareAt > amount && (
				<span className="text-[12.5px] text-nl-russet line-through">{formatFils(compareAt, locale)}</span>
			)}
		</span>
	);
}
