import {
	StaticPageLayout,
	StaticSection,
	contentsFrom,
} from "@/components/layout/static-page-layout";
import { MillLabel } from "@/components/swatch";
import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Press and media",
	description:
		"Press contact, fact sheet and brand assets for journalists and partners writing about MaterialHub.",
};

const HEADINGS = ["The short version", "Fact sheet", "Press contact", "Brand assets"];

const FACTS = [
	{ label: "Company", value: "MaterialHub FZ-LLC" },
	{ label: "Based in", value: "Dubai, UAE" },
	{ label: "Market", value: "United Arab Emirates" },
	{ label: "Model", value: "Multi-vendor marketplace, trade and retail" },
	{ label: "Categories", value: "7" },
	{ label: "Languages", value: "English, Arabic" },
	{ label: "Payments", value: "Card, Tabby, Tamara, cash on delivery" },
];

export default function PressPage() {
	const [short, facts, contact, assets] = HEADINGS;
	return (
		<StaticPageLayout
			contentLang="en"
			eyebrow="Company"
			title="Press and media"
			intro="For interviews, fact checks, brand assets or partnership enquiries, email us and tell us your outlet and deadline."
			contents={contentsFrom(HEADINGS)}
		>
			<StaticSection heading={short}>
				<p>
					MaterialHub is a UAE marketplace for packaging, manufacturing,
					finishing and craft materials. Suppliers list papers and boards, PU
					and bonded leather, book cloth, hinges and magnets, adhesives, foils,
					boxes and cartons, and ribbons and trims in one catalogue, by spec and
					unit of measure. Trade buyers and craft shoppers compare suppliers and
					order in one checkout.
				</p>
			</StaticSection>

			<StaticSection heading={facts}>
				<MillLabel specs={FACTS} className="max-w-[640px] [&_dd]:text-start md:[&_dd]:text-end" />
			</StaticSection>

			<StaticSection heading={contact}>
				<p>
					Press, interviews, industry commentary and partnerships:{" "}
					<a href="mailto:info@materialhubuae.com">info@materialhubuae.com</a>
				</p>
			</StaticSection>

			<StaticSection heading={assets}>
				<p>
					The MaterialHub wordmark and approved imagery are available on
					request. Email{" "}
					<a href="mailto:info@materialhubuae.com">info@materialhubuae.com</a>{" "}
					with your outlet and how you plan to use them.
				</p>
			</StaticSection>
		</StaticPageLayout>
	);
}
