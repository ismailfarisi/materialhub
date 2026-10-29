import type { Metadata } from "next";
import {
	StaticPageLayout,
	StaticSection,
} from "@/components/layout/static-page-layout";

export const metadata: Metadata = {
	title: "Careers at MaterialHub",
	description:
		"Build the beauty marketplace of the Gulf. Open roles, what we look for, and how we hire at MaterialHub.",
};

const VALUES = [
	{
		t: "Customers first, always",
		d: "Every decision starts with the shopper opening the box. Speed, accuracy and care beat clever-for-its-own-sake.",
	},
	{
		t: "Region-native, global standard",
		d: "We build for the UAE — Arabic-first, AED-first, hyperlocal — at a quality bar that travels.",
	},
	{
		t: "Vendors as partners",
		d: "Our brands grow, we grow. Tools, payouts and listings are designed around vendor success, not friction.",
	},
	{
		t: "Operate, don't theorise",
		d: "Small, accountable teams. Ship daily. Numbers on the wall. Theatre off the calendar.",
	},
];

export default function CareersPage() {
	return (
		<StaticPageLayout
			eyebrow="Careers"
			title="Build the beauty marketplace of the Gulf."
			intro="We're growing the team that powers MaterialHub — from product and engineering in Dubai to merchandising and creator partnerships across the UAE."
		>
			<StaticSection heading="How we work">
				<p>
					Small, full-stack teams own outcomes end-to-end. Most engineering
					ships to production daily behind feature flags. Merchandising and
					operations are paired tightly with engineering so changes to the
					storefront, the warehouse and the vendor portal move together.
				</p>
			</StaticSection>

			<StaticSection heading="What we value">
				<div className="grid md:grid-cols-2 gap-6 not-prose">
					{VALUES.map((v) => (
						<div
							key={v.t}
							className="border border-nl-cacao/10 p-5 bg-white/40"
						>
							<h3 className="font-serif text-lg text-nl-cacao mb-2">
								{v.t}
							</h3>
							<p className="text-[14px] text-nl-russet leading-[1.6]">
								{v.d}
							</p>
						</div>
					))}
				</div>
			</StaticSection>

			<StaticSection heading="Open roles">
				<p>
					We aren&rsquo;t actively hiring through a public board right now,
					but we always make room for exceptional product engineers,
					full-stack engineers, beauty merchandisers and creator partnership
					leads based in the UAE.
				</p>
				<p>
					Send a short note and what you&rsquo;ve shipped to{" "}
					<a
						href="mailto:info@materialhubuae.com"
						className="text-nl-amber hover:underline"
					>
						info@materialhubuae.com
					</a>
					. Mention the team you&rsquo;d join and a project you&rsquo;re
					proud of — a link beats a CV.
				</p>
			</StaticSection>

			<StaticSection heading="How we hire">
				<ol className="list-decimal ps-5 space-y-2">
					<li>
						<strong className="text-nl-cacao">Intro call (30 min).</strong>{" "}
						Why MaterialHub, what you&rsquo;re looking for, what we&rsquo;re
						hiring for.
					</li>
					<li>
						<strong className="text-nl-cacao">
							Craft conversation (60 min).
						</strong>{" "}
						A structured, real problem from your discipline — no
						leetcode, no panel theatre.
					</li>
					<li>
						<strong className="text-nl-cacao">
							Working session (half day).
						</strong>{" "}
						You spend time with the team you&rsquo;d join, on a real
						current question. Paid for non-permanent candidates.
					</li>
					<li>
						<strong className="text-nl-cacao">Offer.</strong> Within a
						week of the working session.
					</li>
				</ol>
			</StaticSection>
		</StaticPageLayout>
	);
}
