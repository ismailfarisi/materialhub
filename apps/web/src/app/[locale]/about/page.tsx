import type { Metadata } from "next";
import {
	StaticPageLayout,
	StaticSection,
} from "@/components/layout/static-page-layout";

export const metadata: Metadata = {
	title: "About MaterialHub — UAE's Materials Marketplace",
	description:
		"MaterialHub is a multi-vendor materials marketplace built for the Gulf, bringing trusted packaging, board, leather, hardware and craft suppliers into one UAE address.",
};

export default function AboutPage() {
	return (
		<StaticPageLayout
			eyebrow="Our story"
			title="A marketplace of materials, built for the Gulf."
			intro="MaterialHub gathers the papers, boards, leathers, hardware and finishing materials that makers and manufacturers rely on — from packaging mills to small craft suppliers — and brings them into one trusted address."
		>
			<StaticSection heading="Why we exist">
				<p>
					Sourcing materials in the UAE is fragmented. A packaging board
					comes from one mill, the PU leather from another, the hinges and
					adhesives from a third. Buying it should feel effortless — one
					cart, one delivery, one customer service line, in the language
					you actually speak.
				</p>
				<p>
					MaterialHub exists so businesses and makers don&rsquo;t have to
					choose between a global supplier and a regional one. We work directly with vendors
					to surface only authentic stock, ship from inside the country,
					and price in fils, not guesses.
				</p>
			</StaticSection>

			<StaticSection heading="What we promise">
				<ul className="list-disc ps-5 space-y-2">
					<li>
						<strong className="text-nl-cacao">Authentic only.</strong>{" "}
						Every vendor is vetted; counterfeit listings are removed and
						the seller is offboarded.
					</li>
					<li>
						<strong className="text-nl-cacao">Same-day in the city.</strong>{" "}
						Hyperlocal delivery across Dubai, Abu Dhabi and Sharjah for
						in-stock items ordered before 4pm.
					</li>
					<li>
						<strong className="text-nl-cacao">Five languages.</strong>{" "}
						The whole storefront — search, checkout, support — works in
						Arabic, English, Hindi, Urdu and Malayalam.
					</li>
					<li>
						<strong className="text-nl-cacao">Flexible payment.</strong>{" "}
						Card, Apple Pay, and Buy Now Pay Later via Tamara
						on eligible carts.
					</li>
				</ul>
			</StaticSection>

			<StaticSection heading="By the numbers">
				<div className="grid grid-cols-2 md:grid-cols-4 gap-6 not-prose">
					{[
						{ n: "Curated", l: "vendor network" },
						{ n: "7", l: "categories" },
						{ n: "5", l: "languages" },
						{ n: "3", l: "emirates served same-day" },
					].map((stat) => (
						<div key={stat.l}>
							<div className="font-serif text-3xl md:text-4xl text-nl-amber">
								{stat.n}
							</div>
							<div className="text-[11px] tracking-[0.18em] uppercase text-nl-russet/80 mt-2">
								{stat.l}
							</div>
						</div>
					))}
				</div>
			</StaticSection>

			<StaticSection heading="Where we are">
				<p>
					MaterialHub is headquartered in Dubai, with fulfilment partners in
					Abu Dhabi and Sharjah. The team is a mix of operators, engineers
					and merchandisers from across the Gulf, South Asia and Europe.
				</p>
			</StaticSection>
		</StaticPageLayout>
	);
}
