import { type FaqItem, FaqAccordion } from "@/components/content/faq-accordion";
import {
	StaticPageLayout,
	StaticSection,
	contentsFrom,
} from "@/components/layout/static-page-layout";
import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import Link from "next/link";

export const metadata: Metadata = {
	title: "Frequently asked questions | MaterialHub",
	description:
		"Answers to common MaterialHub questions: ordering materials, delivery, returns, payment, accounts and selling on the marketplace.",
};

function groups(locale: string): Array<{ heading: string; items: FaqItem[] }> {
	const href = (p: string) => `/${locale}/${p}`;
	return [
		{
			heading: "Ordering",
			items: [
				{
					q: "Who am I buying from?",
					a: (
						<p>
							Each listing is sold by the supplier named on it. MaterialHub
							runs the marketplace, takes payment and handles customer care.
							If your cart has items from several suppliers, you pay once and
							each supplier ships its part.
						</p>
					),
				},
				{
					q: "How do I find a material by spec?",
					a: (
						<p>
							Search by material or by spec, for example &ldquo;greyboard 2
							mm&rdquo; or &ldquo;kraft paper 120 gsm&rdquo;, then filter the
							results. Specs such as grammage, thickness and sheet size are
							shown on each listing.
						</p>
					),
				},
				{
					q: "Do I need an account to order?",
					a: (
						<p>
							You can browse without one. Checkout needs an account so we can
							send order updates and you can track, reorder and return from{" "}
							<Link href={href("account/orders")}>My orders</Link>.
						</p>
					),
				},
				{
					q: "Can I order samples, get quantity pricing or request a quote?",
					a: (
						<p>
							Sample ordering, quantity-break pricing and requests for
							quotation are on the way and not available yet. For a large run
							today, <Link href={href("contact")}>contact us</Link> with the
							spec and quantity.
						</p>
					),
				},
			],
		},
		{
			heading: "Delivery",
			items: [
				{
					q: "Where do you deliver?",
					a: (
						<p>
							To addresses in the United Arab Emirates. Delivery options and
							times depend on the supplier and are shown at checkout before you
							pay.
						</p>
					),
				},
				{
					q: "How much is shipping?",
					a: (
						<p>
							Standard shipping is free on orders over AED 150. Below that, and
							for faster options, the price for each supplier&rsquo;s shipment
							is shown at checkout. More on the{" "}
							<Link href={href("shipping")}>shipping page</Link>.
						</p>
					),
				},
				{
					q: "Can I track my order?",
					a: (
						<p>
							Yes. Each shipment has its own tracking under{" "}
							<Link href={href("account/orders")}>My orders</Link>.
						</p>
					),
				},
			],
		},
		{
			heading: "Returns and refunds",
			items: [
				{
					q: "What can I return?",
					a: (
						<p>
							You can request a return within 7 days of delivery. Unopened
							material in its original packaging qualifies, as does anything
							that arrived damaged, faulty or wrong. Cut-to-size, made-to-order
							and opened material does not. See{" "}
							<Link href={href("returns")}>returns</Link>.
						</p>
					),
				},
				{
					q: "When will I get my refund?",
					a: (
						<p>
							Once the supplier receives and checks the return, the refund goes
							back to your original payment method. How long it takes to show
							depends on your bank or payment provider.
						</p>
					),
				},
			],
		},
		{
			heading: "Payment",
			items: [
				{
					q: "Which payment methods do you accept?",
					a: (
						<p>
							Card payments through Stripe, instalments with Tabby or Tamara,
							and cash on delivery. Cash on delivery is available with standard
							delivery and pickup. Instalment eligibility is decided by Tabby
							or Tamara at checkout.
						</p>
					),
				},
				{
					q: "Are my card details stored?",
					a: (
						<p>
							No. Card details go straight to the payment provider. MaterialHub
							never stores your card number.
						</p>
					),
				},
				{
					q: "Which currency am I charged in?",
					a: <p>All prices are in UAE dirhams (AED), and you are charged in AED.</p>,
				},
			],
		},
		{
			heading: "Selling on MaterialHub",
			items: [
				{
					q: "How do I become a supplier?",
					a: (
						<p>
							Apply from the <Link href={href("sell")}>Sell on MaterialHub</Link>{" "}
							page. The team reviews your business details and documents
							before your account goes live.
						</p>
					),
				},
				{
					q: "How are suppliers paid?",
					a: (
						<p>
							Sales are paid out to the supplier&rsquo;s bank account on a set
							schedule, minus the platform commission agreed in the vendor
							agreement.
						</p>
					),
				},
			],
		},
	];
}

export default async function FaqPage() {
	const locale = await getLocale();
	const data = groups(locale);
	return (
		<StaticPageLayout
			contentLang="en"
			eyebrow="Help"
			title="Frequently asked questions"
			intro={
				<>
					Ordering, delivery, returns, payment and selling. If your question
					isn&rsquo;t here,{" "}
					<Link
						href={`/${locale}/contact`}
						className="text-nl-cacao underline decoration-nl-cacao/30 underline-offset-[0.2em] hover:decoration-nl-amber"
					>
						send us a message
					</Link>
					.
				</>
			}
			contents={contentsFrom(data.map((g) => g.heading))}
		>
			{data.map((group) => (
				<StaticSection key={group.heading} heading={group.heading}>
					<FaqAccordion items={group.items} />
				</StaticSection>
			))}
		</StaticPageLayout>
	);
}
