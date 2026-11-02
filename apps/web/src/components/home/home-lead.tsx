import { FanDeck } from "@/components/swatch";
import { buttonVariants } from "@/components/swatch/button";
import { cn } from "@/lib/utils";
import { CircleAlert, Search } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

/**
 * Stands in for the CMS hero when the home layout has no sections — not yet
 * published, or the CMS is unreachable. It says what MaterialHub sells, points
 * at search and the category row, and carries the page's one fan deck.
 */
export async function HomeLead({
	locale,
	unavailable = false,
}: { locale: string; unavailable?: boolean }) {
	const t = await getTranslations({ locale, namespace: "home" });
	return (
		<section
			data-section="home-lead"
			className="max-w-[1400px] mx-auto px-4 md:px-8 pt-6 md:pt-12"
		>
			{unavailable && (
				<output className="mb-6 md:mb-8 flex items-start gap-2.5 rounded-md bg-nl-pearl shadow-card px-4 py-3 text-[14px] leading-[1.5] text-nl-cacao">
					<CircleAlert
						aria-hidden="true"
						className="mt-0.5 h-4 w-4 shrink-0 text-nl-russet"
						strokeWidth={1.75}
					/>
					{t("sectionsUnavailable")}
				</output>
			)}
			<div className="grid items-center gap-8 md:grid-cols-[1.15fr_1fr] md:gap-12">
				<div className="grid gap-5 md:gap-6">
					<h1 className="m-0 max-w-[16ch] font-display font-bold [font-stretch:112%] text-[clamp(36px,5vw,76px)] leading-[1] tracking-[-0.03em] text-nl-cacao text-balance">
						{t("lead.title")}
					</h1>
					<p className="m-0 max-w-[52ch] text-[16px] md:text-[17px] leading-[1.6] text-nl-russet">
						{t("lead.body")}
					</p>
					<div className="flex flex-wrap gap-3">
						<Link
							href={`/${locale}/search`}
							className={buttonVariants({ variant: "primary", size: "lg" })}
						>
							<Search
								aria-hidden="true"
								className="h-4 w-4"
								strokeWidth={1.75}
							/>
							{t("lead.search")}
						</Link>
						<a
							href="#materials"
							className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
						>
							{t("lead.browse")}
						</a>
					</div>
				</div>
				<FanDeck className="max-w-[300px] sm:max-w-[420px] md:max-w-[520px] justify-self-center" />
			</div>
		</section>
	);
}
