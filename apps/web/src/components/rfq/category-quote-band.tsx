import { Button } from "@/components/swatch";
import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

/**
 * Category page entry to RFQ: a quiet band under the listing. The supplier
 * picker lives on the request form, scoped to this category's suppliers.
 */
export async function CategoryQuoteBand({
	locale,
	categorySlug,
	categoryName,
	supplierCount,
}: {
	locale: string;
	categorySlug: string;
	categoryName: string;
	/** Suppliers listing in this category (from the vendor facet). */
	supplierCount: number;
}) {
	if (supplierCount < 1) return null;
	const t = await getTranslations({ locale, namespace: "rfq.entry" });
	return (
		<section
			aria-labelledby="rfq-band-title"
			className="mt-10 grid gap-4 rounded-md bg-nl-pearl p-5 shadow-card md:mt-14 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-8 md:p-7"
		>
			<div className="grid max-w-[68ch] gap-1.5">
				<h2
					id="rfq-band-title"
					className="m-0 font-display text-[19px] font-semibold leading-tight tracking-[-0.015em] text-nl-cacao md:text-[22px]"
				>
					{t("categoryTitle")}
				</h2>
				<p className="m-0 text-sm text-nl-russet">
					{t("categoryBody", { category: categoryName })}
				</p>
			</div>
			<Button asChild variant="primary" className="justify-self-start">
				<Link
					href={`/${locale}/account/quotes/new?category=${encodeURIComponent(categorySlug)}`}
				>
					{t("categoryButton")}
					<ArrowRight
						className="h-4 w-4 rtl:rotate-180"
						strokeWidth={1.75}
						aria-hidden="true"
					/>
				</Link>
			</Button>
		</section>
	);
}
