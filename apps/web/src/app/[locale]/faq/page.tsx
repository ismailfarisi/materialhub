import type { Metadata } from "next";
import {
	StaticPageLayout,
	StaticSection,
} from "@/components/layout/static-page-layout";

export const metadata: Metadata = {
	title: "Frequently Asked Questions — MaterialHub",
	description:
		"Answers to the most common MaterialHub questions: orders, shipping, returns, payments, vendors and account.",
};

const FAQ_GROUPS: Array<{
	heading: string;
	items: Array<{ q: string; a: React.ReactNode }>;
}> = [
	{
		heading: "Orders & shipping",
		items: [
			{
				q: "When will my order arrive?",
				a: (
					<>
						In-stock items ordered before 4pm GST are delivered same-day
						in Dubai, Abu Dhabi and Sharjah. Other emirates and remote
						addresses ship in 1–3 working days. See{" "}
						<a href="shipping" className="text-nl-amber hover:underline">
							Shipping Info
						</a>{" "}
						for the full breakdown.
					</>
				),
			},
			{
				q: "How much is shipping?",
				a: (
					<>
						Standard shipping is free on orders of AED 150 or more.
						Below that, a flat AED 15 applies. Same-day in-city
						delivery is AED 29 regardless of cart value.
					</>
				),
			},
			{
				q: "Can I track my order?",
				a: (
					<>
						Yes — every shipment has a tracking link in your order
						confirmation email and under{" "}
						<a
							href="account/orders"
							className="text-nl-amber hover:underline"
						>
							My orders
						</a>
						.
					</>
				),
			},
		],
	},
	{
		heading: "Returns & refunds",
		items: [
			{
				q: "What is your returns policy?",
				a: (
					<>
						You have <strong>7 days</strong> from delivery to request
						a return on unopened, unused items. Hygiene-sealed and
						personalised products are not eligible. Full details on the{" "}
						<a href="returns" className="text-nl-amber hover:underline">
							Returns
						</a>{" "}
						page.
					</>
				),
			},
			{
				q: "When will I get my refund?",
				a: (
					<>
						Once the return is received and inspected, refunds go back
						to the original payment method within 5–10 working days.
						Wallet credit refunds are instant.
					</>
				),
			},
		],
	},
	{
		heading: "Payments",
		items: [
			{
				q: "Which payment methods do you accept?",
				a: (
					<>
						Visa, Mastercard, Amex, Apple Pay and Buy Now Pay Later via
						Tamara (subject to cart-total eligibility). Cash on
						delivery is not currently supported.
					</>
				),
			},
			{
				q: "Are my card details safe?",
				a: (
					<>
						Card details are processed by PCI-DSS Level 1 payment
						providers (Stripe, Checkout.com) and never stored on
						MaterialHub&rsquo;s servers.
					</>
				),
			},
			{
				q: "What currency am I charged in?",
				a: (
					<>
						All prices are in AED at checkout. You can change the
						display currency in the top bar, but the charge is always
						processed in AED.
					</>
				),
			},
		],
	},
	{
		heading: "Account & vendors",
		items: [
			{
				q: "Do I need an account to buy?",
				a: (
					<>
						You can browse as a guest, but checkout requires an account
						so we can email order updates and let you re-order, track
						and return.
					</>
				),
			},
			{
				q: "How do I become a vendor on MaterialHub?",
				a: (
					<>
						Vendor onboarding lives on{" "}
						<a
							href="https://sellers.materialhubuae.com"
							className="text-nl-amber hover:underline"
						>
							sellers.materialhubuae.com
						</a>
						. Submit a short application and our merchandising team
						will reach out within three business days.
					</>
				),
			},
		],
	},
];

export default function FaqPage() {
	return (
		<StaticPageLayout
			eyebrow="Help"
			title="Frequently asked questions."
			intro="Most answers live here. If yours doesn't, customer care is one click away on the Contact page."
		>
			{FAQ_GROUPS.map((group) => (
				<StaticSection key={group.heading} heading={group.heading}>
					<div className="not-prose divide-y divide-nl-cacao/10 border-y border-nl-cacao/10">
						{group.items.map((item) => (
							<details key={item.q} className="group py-4">
								<summary className="cursor-pointer list-none flex items-center justify-between gap-4 text-nl-cacao font-medium text-[15px] md:text-base">
									<span>{item.q}</span>
									<span
										aria-hidden
										className="text-nl-amber transition-transform group-open:rotate-45 text-2xl leading-none"
									>
										+
									</span>
								</summary>
								<div className="mt-3 text-nl-russet text-[14px] md:text-[15px] leading-[1.7]">
									{item.a}
								</div>
							</details>
						))}
					</div>
				</StaticSection>
			))}
		</StaticPageLayout>
	);
}
