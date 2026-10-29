import type { Metadata } from "next";
import {
	StaticPageLayout,
	StaticSection,
} from "@/components/layout/static-page-layout";

export const metadata: Metadata = {
	title: "Press & Media — MaterialHub",
	description:
		"Press contacts, brand assets and the MaterialHub story for journalists and partners.",
};

const FACTS = [
	{ k: "Founded", v: "2025, Dubai" },
	{ k: "Headquarters", v: "Dubai, United Arab Emirates" },
	{ k: "Markets", v: "UAE (Dubai, Abu Dhabi, Sharjah)" },
	{ k: "Categories", v: "Papers · Boards · PU Leather · Hinges · Adhesives · Ribbons · Decoration" },
	{ k: "Languages", v: "Arabic · English · Hindi · Urdu · Malayalam" },
	{ k: "Marketplace model", v: "Multi-vendor B2B + B2C materials marketplace" },
];

export default function PressPage() {
	return (
		<StaticPageLayout
			eyebrow="Press"
			title="Press, partnerships, and the MaterialHub story."
			intro="For interviews, brand assets or partnership enquiries, our press team is one email away."
		>
			<StaticSection heading="The short version">
				<p>
					MaterialHub is a UAE-based multi-vendor materials marketplace. We work
					directly with packaging, board, leather, hardware and craft suppliers —
					regional mills and global manufacturers — to bring authentic stock
					to Gulf customers with hyperlocal same-day delivery, Arabic-first
					commerce, and BNPL options native to the region.
				</p>
			</StaticSection>

			<StaticSection heading="Fact sheet">
				<div className="not-prose border border-nl-cacao/10 divide-y divide-nl-cacao/10 bg-white/40">
					{FACTS.map((f) => (
						<div
							key={f.k}
							className="grid grid-cols-[140px_1fr] md:grid-cols-[200px_1fr] gap-4 px-5 py-4 text-[14px]"
						>
							<dt className="text-[10px] tracking-[0.2em] uppercase text-nl-russet/80 self-center">
								{f.k}
							</dt>
							<dd className="text-nl-cacao">{f.v}</dd>
						</div>
					))}
				</div>
			</StaticSection>

			<StaticSection heading="Media contacts">
				<p>
					Press, interviews and regional industry commentary, plus brand
					partnerships and trade tie-ins:{" "}
					<a
						href="mailto:info@materialhubuae.com"
						className="text-nl-amber hover:underline"
					>
						info@materialhubuae.com
					</a>
				</p>
			</StaticSection>

			<StaticSection heading="Brand assets">
				<p>
					Logo lockups, founder portraits and approved photography are
					available on request. Please email{" "}
					<a
						href="mailto:info@materialhubuae.com"
						className="text-nl-amber hover:underline"
					>
						info@materialhubuae.com
					</a>{" "}
					with your outlet and intended use and we&rsquo;ll send a kit
					within one business day.
				</p>
			</StaticSection>
		</StaticPageLayout>
	);
}
