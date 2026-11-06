"use client";

import { MAX_QUOTE_SUPPLIERS, type SupplierOption } from "@/lib/queries/rfq";
import { cn } from "@/lib/utils";
import { Check, Lock } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * Choose up to three suppliers. A locked supplier (the product page's own
 * seller) counts toward the three and can't be removed.
 */
export function SupplierPicker({
	options,
	selected,
	onChange,
	locked,
	loading,
	error,
	id = "rfq-suppliers",
}: {
	options: SupplierOption[];
	selected: string[];
	onChange: (slugs: string[]) => void;
	locked?: { slug: string; name: string } | null;
	loading?: boolean;
	error?: string | null;
	id?: string;
}) {
	const t = useTranslations("rfq.form");
	const max = MAX_QUOTE_SUPPLIERS;
	const chosen = selected.length + (locked ? 1 : 0);
	const full = chosen >= max;
	const rest = options.filter((o) => o.slug !== locked?.slug);

	function toggle(slug: string) {
		if (selected.includes(slug)) onChange(selected.filter((s) => s !== slug));
		else if (!full) onChange([...selected, slug]);
	}

	return (
		<fieldset
			className="m-0 grid min-w-0 gap-2 border-0 p-0"
			aria-describedby={`${id}-hint`}
		>
			<div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
				{/* The panel heading already reads "Suppliers"; keep the legend for screen readers. */}
				<legend className="sr-only">{t("suppliersLabel")}</legend>
				<span
					className="font-mono text-[12.5px] tabular-nums text-nl-russet"
					aria-live="polite"
				>
					{t("suppliersChosen", { count: chosen, max })}
				</span>
			</div>
			<p id={`${id}-hint`} className="m-0 text-[13px] text-nl-russet">
				{full && rest.length > 0
					? t("suppliersLimit", { max })
					: t("suppliersHint", { max })}
			</p>

			<ul className="m-0 grid list-none gap-1.5 p-0">
				{locked && (
					<li>
						<div className="flex min-h-12 items-center gap-3 rounded-md border border-nl-cacao bg-nl-pearl px-3.5 py-2.5">
							<span
								className="grid h-5 w-5 shrink-0 place-items-center rounded-sm bg-nl-cacao text-white"
								aria-hidden="true"
							>
								<Lock className="h-3 w-3" strokeWidth={2} />
							</span>
							<span className="grid min-w-0">
								<span className="truncate text-sm font-medium text-nl-cacao">
									{locked.name}
								</span>
								<span className="text-[12.5px] text-nl-russet">
									{t("productSupplier")}
								</span>
							</span>
						</div>
					</li>
				)}
				{rest.map((o) => {
					const on = selected.includes(o.slug);
					const disabled = !on && full;
					return (
						<li key={o.slug}>
							<label
								className={cn(
									"flex min-h-12 cursor-pointer items-center gap-3 rounded-md border bg-nl-pearl px-3.5 py-2.5 transition-colors",
									"has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-nl-amber",
									on
										? "border-nl-cacao"
										: "border-nl-cacao/15 hover:border-nl-cacao/40",
									disabled &&
										"cursor-not-allowed opacity-50 hover:border-nl-cacao/15",
								)}
							>
								<input
									type="checkbox"
									className="peer sr-only"
									checked={on}
									disabled={disabled}
									onChange={() => toggle(o.slug)}
								/>
								<span
									aria-hidden="true"
									className={cn(
										"grid h-5 w-5 shrink-0 place-items-center rounded-sm border",
										on
											? "border-nl-cacao bg-nl-cacao text-white"
											: "border-nl-cacao/35 bg-nl-pearl",
									)}
								>
									{on && <Check className="h-3.5 w-3.5" strokeWidth={2.25} />}
								</span>
								<span className="min-w-0 flex-1 truncate text-sm text-nl-cacao">
									{o.name}
								</span>
							</label>
						</li>
					);
				})}
			</ul>
			{loading && (
				<p className="m-0 text-[13px] text-nl-russet">
					{t("suppliersLoading")}
				</p>
			)}
			{!loading && rest.length === 0 && (
				<p className="m-0 text-[13px] text-nl-russet">{t("suppliersNone")}</p>
			)}
			{error && (
				<p role="alert" className="m-0 text-[13px] text-destructive">
					{error}
				</p>
			)}
		</fieldset>
	);
}
