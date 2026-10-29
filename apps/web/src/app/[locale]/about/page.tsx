import type { Metadata } from "next";
import {
	StaticPageLayout,
	StaticSection,
} from "@/components/layout/static-page-layout";

export const metadata: Metadata = {
	title: "About MaterialHub — UAE's Beauty Marketplace",
	description:
		"MaterialHub is a curated multi-vendor beauty marketplace built for the Gulf, bringing trusted beauty, fragrance and wellness vendors into one UAE shopping address.",
};

export default function AboutPage() {
	return (
		<StaticPageLayout
			eyebrow="Our story"
			title="A house of brands, built for the Gulf."
			intro="MaterialHub gathers the rituals, formulas and houses that shape modern Arabian beauty — from heritage attar makers to clean-skin founders — and brings them into one trusted address."
		>
			<StaticSection heading="Why we exist">
				<p>
					Beauty in the UAE is plural. A skincare regimen begins in Seoul,
					travels through Paris, and ends with an oud sprayed in Sharjah.
					Buying it should feel that effortless — one cart, one delivery,
					one customer service line, in the language you actually speak.
				</p>
				<p>
					MaterialHub exists so customers don&rsquo;t have to choose between
					a global edit and a regional one. We work directly with vendors
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
