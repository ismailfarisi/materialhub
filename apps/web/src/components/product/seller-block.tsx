"use client";

import { Button, type Stock, SwatchCard } from "@/components/swatch";
import { useFollowState, useFollowVendor, useUnfollowVendor } from "@/lib/queries/vendor-follow";
import { cn } from "@/lib/utils";
import { ArrowRight, BadgeCheck, Check } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import type { ReactNode } from "react";

export type SellerBlockData = {
	id: string;
	name: string;
	slug: string;
	monogram?: string;
	logo_url?: string | null;
	verified?: boolean;
	rating_avg?: number | null;
	follower_count?: number | null;
	response_time_hours?: number | null;
	/** Vendor processing time before dispatch, in days. */
	processing_days?: number | null;
};

function defaultMonogram(name: string): string {
	return name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((w) => w[0]?.toUpperCase() ?? "")
		.join("");
}

interface SellerBlockProps {
	vendor: SellerBlockData;
	/** The product's top-level category stock; the card's tab shows it. */
	stock?: Stock | null;
	/** Top-level category name, printed on the tab. */
	stockLabel?: string;
	storefrontHref?: string;
}

/**
 * The supplier as a swatch card: who sells this material is part of the
 * product, not small print. The tab carries the product's category stock.
 * Facts are only shown when the vendor record has them.
 */
export function SellerBlock({ vendor, stock, stockLabel, storefrontHref }: SellerBlockProps) {
	const t = useTranslations("pdp");
	const locale = useLocale();
	const followState = useFollowState(vendor.id);
	const followMutation = useFollowVendor();
	const unfollowMutation = useUnfollowVendor();
	const following = followState.data ?? false;
	const isPending = followMutation.isPending || unfollowMutation.isPending;
	const monogram = vendor.monogram ?? defaultMonogram(vendor.name);
	const href = storefrontHref ?? `/${locale}/vendor/${vendor.slug}`;
	const nf = new Intl.NumberFormat(locale === "ar" ? "ar-AE" : "en-AE", { notation: "compact" });

	const facts: Array<{ label: string; value: string }> = [];
	if (vendor.rating_avg != null && vendor.rating_avg > 0)
		facts.push({ label: t("supplierRating"), value: `${vendor.rating_avg.toFixed(1)} / 5` });
	if (vendor.processing_days != null && vendor.processing_days > 0)
		facts.push({ label: t("shipsIn"), value: t("shipsInDays", { days: vendor.processing_days }) });
	if (vendor.response_time_hours != null && vendor.response_time_hours > 0)
		facts.push({ label: t("replies"), value: t("repliesHours", { hours: vendor.response_time_hours }) });
	if (vendor.follower_count != null && vendor.follower_count > 0)
		facts.push({ label: t("followers"), value: nf.format(vendor.follower_count) });

	const body: ReactNode = (
		<div className="grid gap-4 p-4">
			<div className="flex items-start gap-3">
				<div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-nl-cacao font-display text-[15px] font-semibold text-white">
					{vendor.logo_url ? (
						<img src={vendor.logo_url} alt="" className="h-full w-full bg-white object-contain" />
					) : (
						<span aria-hidden="true">{monogram}</span>
					)}
				</div>
				<div className="grid min-w-0 gap-1">
					<span className="text-[12.5px] text-nl-russet">{t("soldBy")}</span>
					<Link
						href={href}
						className="font-display text-[17px] font-semibold leading-tight tracking-[-0.01em] text-nl-cacao underline decoration-transparent underline-offset-4 hover:decoration-nl-cacao/40"
					>
						{vendor.name}
					</Link>
					{vendor.verified && (
						<span className="inline-flex items-center gap-1 text-[12.5px] text-nl-cacao">
							<BadgeCheck className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
							{t("verified")}
						</span>
					)}
				</div>
			</div>

			{facts.length > 0 && (
				<dl className="m-0 grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-nl-cacao/10 bg-nl-cacao/10 sm:grid-cols-4">
					{facts.map((f) => (
						<div key={f.label} className="grid gap-1 bg-nl-pearl px-3 py-2">
							<dt className="mill-label text-[11px] text-nl-russet">{f.label}</dt>
							<dd className="m-0 font-mono text-[13px] tabular-nums text-nl-cacao">{f.value}</dd>
						</div>
					))}
				</dl>
			)}

			<div className="flex flex-wrap items-center gap-2">
				<Button
					type="button"
					variant={following ? "primary" : "outline"}
					size="sm"
					onClick={() => (following ? unfollowMutation.mutate(vendor.id) : followMutation.mutate(vendor.id))}
					disabled={isPending}
					aria-pressed={following}
					className={cn(isPending && "cursor-wait")}
				>
					{following && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
					{following ? t("following") : t("follow")}
				</Button>
				<Button asChild variant="ghost" size="sm" className="group">
					<Link href={href}>
						{t("visitSupplier")}
						<ArrowRight
							className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
							strokeWidth={1.75}
							aria-hidden="true"
						/>
					</Link>
				</Button>
			</div>
		</div>
	);

	if (!stock) {
		return <section aria-label={t("soldBy")} className="rounded-md bg-nl-pearl shadow-card">{body}</section>;
	}
	return (
		<SwatchCard stock={stock} tabLabel={stockLabel} interactive={false} as="article">
			{body}
		</SwatchCard>
	);
}
