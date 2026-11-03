import { CategoryStocks } from "@/components/content/category-stocks";
import {
	StaticPageLayout,
	StaticSection,
	contentsFrom,
} from "@/components/layout/static-page-layout";
import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import Link from "next/link";

export const metadata: Metadata = {
	title: "About MaterialHub: the UAE materials marketplace",
	description:
		"MaterialHub is a multi-vendor marketplace where UAE buyers source papers, boards, leather, hardware, adhesives, packaging and trims from verified suppliers in one catalogue.",
};

const HEADINGS = [
	"Why MaterialHub exists",
	"The seven categories",
	"How buying works",
	"Who we build for",
	"Where we are",
];

export default async function AboutPage() {
	const locale = await getLocale();
	const [why, categories, buying, who, where] = HEADINGS;
	return (
		<StaticPageLayout
			contentLang="en"
			eyebrow="About"
			title="One catalogue for the whole materials chain."
			intro="MaterialHub brings the papers, boards, leathers, fittings, adhesives, packaging and trims that UAE workshops and makers rely on into one marketplace, sold by the suppliers who stock them."
			label={[
				{ label: "Based in", value: "Dubai, UAE" },
				{ label: "Categories", value: "7" },
				{ label: "Languages", value: "English · العربية" },
				{ label: "Prices in", value: "AED" },
			]}
			contents={contentsFrom(HEADINGS)}
		>
			<StaticSection heading={why}>
				<p>
					Sourcing materials in the UAE is fragmented. The greyboard for a
					rigid box comes from one supplier, the book cloth from another, the
					magnets and hot-melt glue from a third. Each has its own price
					list, its own minimums and its own way of taking an order.
				</p>
				<p>
					MaterialHub puts those suppliers in one catalogue. Every listing
					names its supplier, its specs and the unit it sells by, so you can
					compare like for like, order in one checkout and track each
					supplier&rsquo;s shipment from your account.
				</p>
			</StaticSection>

			<StaticSection heading={categories}>
				<p>
					The catalogue follows the way the trade already sorts material.
					Each category has its own stock colour across the store, like the
					tabs in a swatch book.
				</p>
				<CategoryStocks locale={locale} columns="two" className="mt-6 max-w-[760px]" />
			</StaticSection>

			<StaticSection heading={buying}>
				<ul>
					<li>
						<strong>Specs first.</strong> Grammage, thickness, sheet size,
						roll width and finish sit on the listing, not in the small print.
					</li>
					<li>
						<strong>Suppliers you can see.</strong> Every product shows who
						sells it, with a storefront for each supplier.
					</li>
					<li>
						<strong>Pay the way that suits you.</strong> Card, Tabby and
						Tamara instalments, or cash on delivery.
					</li>
					<li>
						<strong>Delivery across the UAE.</strong> Standard shipping is
						free on orders over AED 150. See{" "}
						<Link href={`/${locale}/shipping`}>shipping</Link> for the
						options.
					</li>
				</ul>
			</StaticSection>

			<StaticSection heading={who}>
				<p>
					Trade buyers come first: packaging, print-finishing, rigid-box,
					bookbinding and leather-goods workshops, and the procurement teams
					at manufacturers who buy for them. Craft and decoration shoppers
					are welcome too, for sample packs, decorative papers, party decor,
					craft kits and stationery.
				</p>
				<p>
					Suppliers sell on MaterialHub without running their own
					storefront. If you stock materials, read{" "}
					<Link href={`/${locale}/sell`}>how to sell with us</Link>.
				</p>
			</StaticSection>

			<StaticSection heading={where}>
				<p>
					MaterialHub is based in Dubai and serves buyers across the United
					Arab Emirates. Questions go to{" "}
					<Link href={`/${locale}/contact`}>customer care</Link>, in Arabic
					or English.
				</p>
			</StaticSection>
		</StaticPageLayout>
	);
}
