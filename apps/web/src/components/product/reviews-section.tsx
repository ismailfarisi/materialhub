"use client";

import { Button, SectionHead } from "@/components/swatch";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, Star } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";

export interface ProductReview {
	id: string;
	rating: number;
	title?: string | null;
	body?: string | null;
	media_urls?: string[] | null;
	is_verified_purchase?: boolean;
	helpful_count?: number;
	vendor_reply?: string | null;
	created_at?: string;
	user?: { first_name?: string | null; last_name?: string | null } | null;
}

/** Approved reviews for a product, most helpful first. */
export function useProductReviewList(productId: string, enabled: boolean) {
	return useQuery({
		queryKey: ["product-reviews", productId, "pdp"],
		queryFn: async () => {
			const { data } = await api.get<{ data: ProductReview[]; total: number }>(`/products/${productId}/reviews`, {
				params: { limit: 6, sort: "most_helpful" },
			});
			return data.data ?? [];
		},
		enabled: enabled && !!productId,
		retry: false,
		staleTime: 5 * 60 * 1000,
	});
}

function Stars({ value, className }: { value: number; className?: string }) {
	return (
		<span className={cn("inline-flex gap-0.5", className)} aria-hidden="true">
			{[1, 2, 3, 4, 5].map((i) => (
				<Star
					key={i}
					className={cn("h-3.5 w-3.5", i <= Math.round(value) ? "fill-nl-cacao text-nl-cacao" : "fill-transparent text-nl-cacao/30")}
					strokeWidth={1.5}
				/>
			))}
		</span>
	);
}

/**
 * Reviews: the aggregate from the product record on the left, individual
 * reviews on the right. With no reviews it says so plainly and points
 * buyers to their orders, which is where reviews are written.
 */
export function ReviewsSection({
	productId,
	ratingAvg,
	reviewCount,
	initialReviews,
}: {
	productId: string;
	ratingAvg: number;
	reviewCount: number;
	/** For tests and previews: skip the fetch and show these. */
	initialReviews?: ProductReview[];
}) {
	const t = useTranslations("pdp");
	const locale = useLocale();
	const hasReviews = reviewCount > 0;
	const query = useProductReviewList(productId, hasReviews && !initialReviews);
	const reviews = initialReviews ?? query.data ?? [];
	const dateFmt = new Intl.DateTimeFormat(locale === "ar" ? "ar-AE" : "en-AE", { dateStyle: "medium" });

	return (
		<section id="reviews" aria-labelledby="pdp-reviews" className="scroll-mt-24 border-t border-nl-cacao/10">
			<div className="mx-auto grid max-w-[1400px] gap-8 px-4 py-10 md:px-8 md:py-16 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-16">
				<div className="grid content-start gap-5">
					<SectionHead title={<span id="pdp-reviews">{t("reviewsTitle")}</span>} />
					{hasReviews ? (
						<div className="grid gap-2">
							<div className="flex items-baseline gap-3">
								<span className="font-display text-[48px] font-semibold leading-none tracking-[-0.03em] tabular-nums">
									{ratingAvg.toFixed(1)}
								</span>
								<span className="font-mono text-[13px] text-nl-russet">/ 5</span>
							</div>
							<Stars value={ratingAvg} />
							<p className="m-0 text-[13px] text-nl-russet">
								<span className="sr-only">{t("ratingOutOf", { rating: ratingAvg.toFixed(1) })}. </span>
								{t("basedOn", { count: reviewCount })}
							</p>
						</div>
					) : (
						<div className="grid max-w-[44ch] gap-3 rounded-md border border-dashed border-nl-cacao/25 p-5">
							<p className="m-0 font-display text-[15.5px] font-semibold">{t("noReviews")}</p>
							<p className="m-0 text-[14px] leading-relaxed text-nl-russet">{t("noReviewsBody")}</p>
							<Button asChild variant="outline" size="sm" className="justify-self-start">
								<Link href={`/${locale}/account/orders`}>{t("yourOrders")}</Link>
							</Button>
						</div>
					)}
				</div>

				{hasReviews && (
					<div className="min-w-0">
						{query.isPending && !initialReviews ? (
							<ul className="m-0 grid list-none gap-3 p-0" aria-busy="true">
								{[0, 1, 2].map((i) => (
									<li key={i} className="grid gap-3 rounded-md bg-nl-pearl p-5 shadow-card">
										<span className="h-3.5 w-24 animate-pulse rounded-sm bg-nl-linen motion-reduce:animate-none" />
										<span className="h-4 w-2/3 animate-pulse rounded-sm bg-nl-linen motion-reduce:animate-none" />
										<span className="h-3 w-full animate-pulse rounded-sm bg-nl-linen motion-reduce:animate-none" />
									</li>
								))}
							</ul>
						) : reviews.length === 0 ? (
							<p className="m-0 rounded-md border border-dashed border-nl-cacao/25 p-5 text-[14px] text-nl-russet">
								{t("reviewsUnavailable")}
							</p>
						) : (
							<ul className="m-0 grid list-none gap-3 p-0">
								{reviews.map((r) => (
									<li key={r.id}>
										<article className="grid gap-3 rounded-md bg-nl-pearl p-5 shadow-card">
											<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
												<Stars value={r.rating} />
												<span className="sr-only">{t("ratingOutOf", { rating: r.rating })}</span>
												{r.is_verified_purchase && (
													<span className="inline-flex items-center gap-1 text-[12.5px] text-nl-cacao">
														<BadgeCheck className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
														{t("verifiedPurchase")}
													</span>
												)}
											</div>
											{r.title && <h3 className="m-0 font-display text-[15.5px] font-semibold leading-snug">{r.title}</h3>}
											{r.body && <p className="m-0 max-w-[70ch] whitespace-pre-line break-words text-[14.5px] leading-relaxed">{r.body}</p>}
											{r.media_urls && r.media_urls.length > 0 && (
												<ul className="m-0 flex list-none flex-wrap gap-2 p-0">
													{r.media_urls.slice(0, 6).map((url) => (
														<li key={url}>
															<a href={url} target="_blank" rel="noreferrer" className="block h-16 w-16 overflow-hidden rounded-sm bg-nl-linen">
																<img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
															</a>
														</li>
													))}
												</ul>
											)}
											<p className="m-0 flex flex-wrap gap-x-3 text-[12.5px] text-nl-russet">
												{r.user?.first_name && <span>{r.user.first_name}</span>}
												{r.created_at && <time dateTime={r.created_at} className="font-mono tabular-nums">{dateFmt.format(new Date(r.created_at))}</time>}
												{(r.helpful_count ?? 0) > 0 && <span>{t("helpful", { count: r.helpful_count ?? 0 })}</span>}
											</p>
											{r.vendor_reply && (
												<div className="grid gap-1 rounded-sm bg-nl-linen px-4 py-3">
													<span className="mill-label text-nl-russet">{t("supplierReply")}</span>
													<p className="m-0 whitespace-pre-line text-[14px] leading-relaxed">{r.vendor_reply}</p>
												</div>
											)}
										</article>
									</li>
								))}
							</ul>
						)}
					</div>
				)}
			</div>
		</section>
	);
}
