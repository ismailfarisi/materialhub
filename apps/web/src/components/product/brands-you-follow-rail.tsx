"use client";

import { useRecentFollowedVendors } from "@/lib/queries/vendor-follow";
import { ArrowRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";

function monogram(name: string): string {
	return name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((w) => w[0]?.toUpperCase() ?? "")
		.join("");
}

/**
 * Suppliers the signed-in buyer follows, as compact cards. Hidden for guests
 * and for buyers following nobody. Facts shown are only the ones the API
 * returns for each supplier (location, listing count, rating).
 */
export function BrandsYouFollowRail() {
	const t = useTranslations("browse");
	const locale = useLocale();
	const nf = new Intl.NumberFormat(locale === "ar" ? "ar-AE" : "en-AE");
	const { data, isPending } = useRecentFollowedVendors(4);
	const suppliers = data ?? [];

	// Hidden for guests (401) and for users following nothing.
	if (!isPending && suppliers.length === 0) return null;

	return (
		<section className="py-10 md:py-16">
			<div className="mx-auto max-w-[1400px] px-4 md:px-8">
				<div className="mb-6 flex items-end justify-between gap-4">
					<h2 className="m-0 font-display text-[clamp(1.375rem,2.6vw,2rem)] font-semibold leading-[1.08] tracking-[-0.02em] text-nl-cacao">
						{t("followedTitle")}
					</h2>
					{suppliers.length > 0 && (
						<Link
							href={`/${locale}/account/followed-brands`}
							className="group inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-nl-cacao underline decoration-nl-cacao/25 underline-offset-4 hover:decoration-nl-cacao"
						>
							{t("followedAll")}
							<ArrowRight
								aria-hidden="true"
								className="h-4 w-4 transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
								strokeWidth={1.75}
							/>
						</Link>
					)}
				</div>

				<ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 md:gap-4 lg:grid-cols-4">
					{isPending
						? ["s1", "s2", "s3", "s4"].map((k) => (
								<li
									key={k}
									aria-hidden="true"
									className="h-[84px] animate-pulse rounded-md bg-nl-pearl shadow-card motion-reduce:animate-none"
								/>
							))
						: suppliers.map((s) => {
								const facts = [
									s.location,
									s.product_count != null
										? t("listingsCount", {
												count: s.product_count,
												formatted: nf.format(s.product_count),
											})
										: null,
									s.rating_avg != null && s.rating_avg > 0
										? `${s.rating_avg.toFixed(1)} / 5`
										: null,
								].filter(Boolean);
								return (
									<li key={s.id}>
										<Link
											href={`/${locale}/vendor/${s.slug}`}
											className="group flex h-full items-center gap-3.5 rounded-md bg-nl-pearl p-3.5 shadow-card transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-lift focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nl-amber motion-reduce:transition-none motion-reduce:hover:translate-y-0"
										>
											<span
												aria-hidden="true"
												className="relative grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-sm bg-nl-linen font-display text-[15px] font-bold text-nl-cacao/70"
											>
												{s.logo_url ? (
													<Image src={s.logo_url} alt="" fill sizes="48px" className="object-contain p-1" />
												) : (
													monogram(s.name)
												)}
											</span>
											<span className="grid min-w-0 flex-1 gap-0.5">
												<span className="truncate font-display text-[15px] font-semibold tracking-[-0.01em] text-nl-cacao">
													{s.name}
												</span>
												{facts.length > 0 && (
													<span className="truncate font-mono text-[12px] tabular-nums text-nl-russet">
														{facts.join(" · ")}
													</span>
												)}
											</span>
											<ArrowRight
												aria-hidden="true"
												className="h-4 w-4 shrink-0 text-nl-russet transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
												strokeWidth={1.75}
											/>
										</Link>
									</li>
								);
							})}
				</ul>
			</div>
		</section>
	);
}
