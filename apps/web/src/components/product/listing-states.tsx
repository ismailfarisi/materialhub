"use client";

import { Button, buttonVariants } from "@/components/swatch";
import { cn } from "@/lib/utils";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { clearedHref } from "./active-filters-strip";

/**
 * No products for this listing. Two cases with different recoveries: filters
 * narrowed it to nothing (offer to clear them), or nothing is listed here at
 * all (point to search).
 */
export function ListingEmpty({ hasFilters }: { hasFilters: boolean }) {
	const t = useTranslations("browse");
	const locale = useLocale();
	const router = useRouter();
	const params = useSearchParams();

	return (
		<div className="grid justify-items-start gap-3 rounded-md border border-dashed border-nl-cacao/25 bg-nl-pearl/60 px-5 py-10 md:px-8 md:py-14">
			<h2 className="m-0 font-display text-[19px] font-semibold tracking-[-0.01em] text-nl-cacao">
				{hasFilters ? t("emptyFilteredTitle") : t("emptyTitle")}
			</h2>
			<p className="m-0 max-w-[56ch] text-[15px] text-nl-russet">
				{hasFilters ? t("emptyFilteredHint") : t("emptyHint")}
			</p>
			<div className="flex flex-wrap gap-2 pt-2">
				{hasFilters ? (
					<Button
						type="button"
						onClick={() => router.replace(clearedHref(params), { scroll: false })}
					>
						{t("clearFilters")}
					</Button>
				) : (
					<Link href={`/${locale}/search`} className={buttonVariants({ variant: "primary" })}>
						{t("searchCatalogue")}
					</Link>
				)}
			</div>
		</div>
	);
}

/** The catalogue did not answer. Names the problem and offers a retry. */
export function ListingError({
	onRetry,
	className,
}: {
	onRetry?: () => void;
	className?: string;
}) {
	const t = useTranslations("browse");
	const router = useRouter();
	return (
		<div
			role="alert"
			className={cn(
				"grid justify-items-start gap-3 rounded-md border border-nl-cacao/15 bg-nl-pearl px-5 py-10 shadow-card md:px-8 md:py-12",
				className,
			)}
		>
			<AlertTriangle className="h-5 w-5 text-destructive" strokeWidth={1.75} aria-hidden="true" />
			<h2 className="m-0 font-display text-[19px] font-semibold tracking-[-0.01em] text-nl-cacao">
				{t("errorTitle")}
			</h2>
			<p className="m-0 max-w-[56ch] text-[15px] text-nl-russet">{t("errorHint")}</p>
			<Button
				type="button"
				variant="outline"
				className="mt-2"
				onClick={() => (onRetry ? onRetry() : router.refresh())}
			>
				<RotateCcw className="h-4 w-4 rtl:-scale-x-100" strokeWidth={1.75} aria-hidden="true" />
				{t("retry")}
			</Button>
		</div>
	);
}
