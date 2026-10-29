import type { Metadata } from "next";
import {
	StaticPageLayout,
	StaticSection,
} from "@/components/layout/static-page-layout";

export const metadata: Metadata = {
	title: "Returns & Refunds — MaterialHub",
	description:
		"MaterialHub's 7-day returns policy: what you can return, how to start a return, refund times and exclusions.",
};

export default function ReturnsPage() {
	return (
		<StaticPageLayout
			eyebrow="Returns"
			title="Seven days to change your mind."
			intro="If something isn't quite right, you have 7 days from delivery to return it. We pay the pickup if the item is faulty, mis-shipped or damaged in transit."
		>
			<StaticSection heading="What you can return">
				<ul className="list-disc ps-5 space-y-2">
					<li>
						Unopened, unused items in their original packaging, with all
						seals intact.
					</li>
					<li>
						Faulty, damaged or incorrectly delivered items, opened or
						not.
					</li>
				</ul>
			</StaticSection>

			<StaticSection heading="What we can't take back">
				<ul className="list-disc ps-5 space-y-2">
					<li>
						Hygiene-sealed products once the seal is broken — skincare
						droppers, fragrance bottles, lipsticks, mascara.
					</li>
					<li>Personalised, engraved or made-to-order items.</li>
					<li>Gift cards and digital vouchers.</li>
					<li>
						Sale items marked &ldquo;final sale&rdquo; on the product
						page.
					</li>
				</ul>
			</StaticSection>

			<StaticSection heading="How to start a return">
				<ol className="list-decimal ps-5 space-y-2">
					<li>
						Go to{" "}
						<a
							href="account/orders"
							className="text-nl-amber hover:underline"
						>
							My orders
						</a>{" "}
						and open the order you want to return.
					</li>
					<li>
						Tap <strong>Return item</strong>, choose a reason and
						upload a photo if the item is damaged.
					</li>
					<li>
						Pick a pickup window — we collect from your shipping
						address at no charge for faulty/wrong items, AED 19 for
						change-of-mind.
					</li>
					<li>
						Hand the item to the courier in its original packaging with
						the printable return label.
					</li>
				</ol>
			</StaticSection>

			<StaticSection heading="Refunds">
				<p>
					Once your return reaches the vendor and passes a quick
					condition check, your refund is issued within 24 hours and
					lands back on the original payment method in 5–10 working
					days. Refunds to MaterialHub Wallet credit are instant and worth
					5% more.
				</p>
			</StaticSection>

			<StaticSection heading="Exchanges">
				<p>
					We don&rsquo;t do swap-style exchanges — return the original
					and place a new order at the current price. This keeps stock
					and shipping clean across vendors.
				</p>
			</StaticSection>

			<StaticSection heading="Damaged or wrong items">
				<p>
					Get in touch within 48 hours of delivery via{" "}
					<a
						href="mailto:help@materialhubuae.com"
						className="text-nl-amber hover:underline"
					>
						help@materialhubuae.com
					</a>{" "}
					or the chat widget. Include your order number and a photo of
					the issue. We&rsquo;ll arrange a free pickup and dispatch a
					replacement or refund the same day.
				</p>
			</StaticSection>
		</StaticPageLayout>
	);
}
