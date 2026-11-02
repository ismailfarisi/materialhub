"use client";

import type { Spec } from "@/components/swatch";
import { BadgeCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Image from "next/image";
import { SupplierHeader } from "./supplier-header";

interface VendorContext {
	id: string;
	slug: string;
	name: string;
	logo_url?: string | null;
	banner_url?: string | null;
	description?: string | null;
	rating_avg?: number | string | null;
	rating_count?: number | null;
	follower_count?: number | null;
	created_at?: string | null;
	verification_type?:
		| "authorized_retailer"
		| "official_brand"
		| "verified_vendor";
}

/**
 * Facts for the supplier's mill label, built only from fields the public
 * profile actually returns. A rating shows only once there are reviews behind
 * it; nothing is estimated or rounded up.
 */
export function vendorFacts(
	vendor: VendorContext,
	locale: string,
	labels: { since: string; followers: string; rating: string; reviews: (n: number) => string },
): Spec[] {
	const nf = new Intl.NumberFormat(locale === "ar" ? "ar-AE" : "en-AE");
	const facts: Spec[] = [];
	const since = vendor.created_at ? new Date(vendor.created_at) : null;
	if (since && !Number.isNaN(since.getTime())) {
		facts.push({
			label: labels.since,
			value: new Intl.DateTimeFormat(locale === "ar" ? "ar-AE" : "en-AE", {
				year: "numeric",
				month: "short",
			}).format(since),
		});
	}
	const ratingCount = Number(vendor.rating_count ?? 0);
	const rating = Number(vendor.rating_avg ?? 0);
	if (ratingCount > 0 && rating > 0) {
		facts.push({
			label: labels.rating,
			value: `${rating.toFixed(1)} / 5 · ${labels.reviews(ratingCount)}`,
		});
	}
	const followers = Number(vendor.follower_count ?? 0);
	if (followers > 0) {
		facts.push({ label: labels.followers, value: nf.format(followers) });
	}
	return facts;
}

export function VendorStorefrontHero({ vendor }: { vendor: VendorContext }) {
	const tVendor = useTranslations("vendor");
	const t = useTranslations("browse");
	const locale = useLocale();

	const facts = vendorFacts(vendor, locale, {
		since: t("factSince"),
		followers: t("factFollowers"),
		rating: t("factRating"),
		reviews: (n) => t("reviewsCount", { count: n }),
	});

	return (
		<section className="mx-auto max-w-[1400px] px-4 pt-4 md:px-8 md:pt-6">
			{vendor.banner_url && (
				<div className="relative aspect-[16/7] w-full overflow-hidden rounded-md bg-nl-linen sm:aspect-[16/5] md:max-h-[300px]">
					<Image
						src={vendor.banner_url}
						alt=""
						fill
						priority
						className="object-cover"
						sizes="(min-width: 1400px) 1336px, 100vw"
					/>
				</div>
			)}
			<SupplierHeader
				className={vendor.banner_url ? "relative -mt-6 mx-2 md:-mt-14 md:mx-8" : undefined}
				name={vendor.name}
				logoUrl={vendor.logo_url}
				description={vendor.description}
				facts={facts}
				badge={
					vendor.verification_type ? (
						<span className="inline-flex w-fit items-center gap-1.5 rounded-sm bg-nl-linen px-2 py-1 text-nl-cacao">
							<BadgeCheck className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
							<span className="mill-label">{tVendor(vendor.verification_type)}</span>
						</span>
					) : undefined
				}
			/>
		</section>
	);
}
