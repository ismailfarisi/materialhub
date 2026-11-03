import {
	StaticPageLayout,
	StaticSection,
	contentsFrom,
} from "@/components/layout/static-page-layout";
import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Careers at MaterialHub",
	description:
		"Help build the UAE’s materials marketplace. How we work, what we value and how to get in touch about a role at MaterialHub.",
};

const HEADINGS = ["How we work", "What we value", "Open roles", "How we hire"];

const VALUES = [
	{
		t: "The buyer’s spec comes first.",
		d: "A workshop needs the right board at the right thickness, delivered. Accuracy beats cleverness.",
	},
	{
		t: "Suppliers are partners.",
		d: "Listings, payouts and tools are built so suppliers can sell by the sheet, roll or carton without friction.",
	},
	{
		t: "Built for the UAE.",
		d: "Arabic and English, priced in AED, and usable on a phone on a workshop floor.",
	},
	{
		t: "Small teams, owned outcomes.",
		d: "People own a problem from start to finish and ship in small steps.",
	},
];

export default function CareersPage() {
	const [how, values, roles, hire] = HEADINGS;
	return (
		<StaticPageLayout
			contentLang="en"
			eyebrow="Company"
			title="Build the UAE’s materials marketplace."
			intro="We’re a small team in Dubai working on product, engineering, category merchandising and supplier partnerships."
			contents={contentsFrom(HEADINGS)}
		>
			<StaticSection heading={how}>
				<p>
					Small teams own outcomes from start to finish. Merchandising and
					supplier partnerships work alongside engineering, so changes to the
					storefront, the vendor dashboard and the catalogue move together.
				</p>
			</StaticSection>

			<StaticSection heading={values}>
				<dl className="not-prose m-0 grid max-w-[76ch] border-t-2 border-nl-cacao">
					{VALUES.map((v) => (
						<div
							key={v.t}
							className="grid gap-1 md:grid-cols-[minmax(0,15rem)_1fr] md:gap-8 py-4 border-b border-nl-cacao/12"
						>
							<dt className="font-semibold text-nl-cacao">{v.t}</dt>
							<dd className="m-0 text-nl-cacao/85">{v.d}</dd>
						</div>
					))}
				</dl>
			</StaticSection>

			<StaticSection heading={roles}>
				<p>
					There are no open roles listed right now. We&rsquo;re always glad to
					hear from engineers, category merchandisers who know paper, board,
					leather or packaging, and supplier partnership leads based in the UAE.
				</p>
				<p>
					Send a short note and links to work you&rsquo;ve done to{" "}
					<a href="mailto:info@materialhubuae.com">info@materialhubuae.com</a>.
					Tell us which team you&rsquo;d join and why.
				</p>
			</StaticSection>

			<StaticSection heading={hire}>
				<ol>
					<li>
						<strong>Intro call.</strong> Why MaterialHub, what you&rsquo;re
						looking for and what we need.
					</li>
					<li>
						<strong>Working conversation.</strong> A real problem from your
						discipline, talked through together.
					</li>
					<li>
						<strong>Time with the team.</strong> Meet the people you&rsquo;d
						work with, on a current question.
					</li>
					<li>
						<strong>Decision.</strong> We tell you either way.
					</li>
				</ol>
			</StaticSection>
		</StaticPageLayout>
	);
}
