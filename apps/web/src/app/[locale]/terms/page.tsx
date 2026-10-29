import type { Metadata } from "next";
import {
	StaticPageLayout,
	StaticSection,
} from "@/components/layout/static-page-layout";

export const metadata: Metadata = {
	title: "Terms of Service — MaterialHub",
	description:
		"The terms that govern your use of MaterialHub — orders, payments, vendor responsibilities, intellectual property and dispute resolution.",
};

const LAST_UPDATED = "25 May 2026";

export default function TermsPage() {
	return (
		<StaticPageLayout
			eyebrow="Legal"
			title="Terms of Service"
			intro={`The rules that govern your use of MaterialHub. Please read them — opening an account means you accept these terms. Last updated ${LAST_UPDATED}.`}
		>
			<StaticSection heading="1. Who you contract with">
				<p>
					MaterialHub is operated by MaterialHub FZ-LLC, registered in Dubai,
					United Arab Emirates. When you buy a product, your sales
					contract is with the <em>vendor</em> listed on the product
					page; MaterialHub acts as the marketplace, collects payment, and
					provides customer support and dispute resolution.
				</p>
			</StaticSection>

			<StaticSection heading="2. Eligibility">
				<p>
					You must be at least 18 years old and able to enter a binding
					contract under UAE law to open an account and place orders.
					Accounts are personal — you may not transfer them or share
					credentials.
				</p>
			</StaticSection>

			<StaticSection heading="3. Orders & pricing">
				<p>
					Listings are an invitation to buy, not an offer. Your order is
					accepted only when we send the shipment confirmation. We may
					decline orders for stock, pricing or fraud reasons; in that
					case, payment is fully refunded.
				</p>
				<p>
					Prices are in AED and include 5% VAT where applicable. The
					price you see at checkout is the price you pay. Other display
					currencies are indicative only — your card is charged in AED.
				</p>
			</StaticSection>

			<StaticSection heading="4. Payment">
				<p>
					Payment is taken at order placement via card, Apple Pay, or
					eligible BNPL (Tamara). BNPL eligibility depends on
					your cart total and the provider&rsquo;s own approval. We do
					not store full card details.
				</p>
			</StaticSection>

			<StaticSection heading="5. Shipping, returns and refunds">
				<p>
					Shipping timelines, charges and zones are described on the{" "}
					<a href="shipping" className="text-nl-amber hover:underline">
						Shipping
					</a>{" "}
					page. Returns and refund eligibility are described on the{" "}
					<a href="returns" className="text-nl-amber hover:underline">
						Returns
					</a>{" "}
					page. Both pages form part of these terms.
				</p>
			</StaticSection>

			<StaticSection heading="6. Vendor responsibilities">
				<p>
					Vendors are responsible for accurate product information,
					stock availability, packaging and fulfilment to the standard
					described in their MaterialHub vendor agreement. Counterfeit,
					mislabelled or unsafe products are removed and the vendor
					offboarded.
				</p>
			</StaticSection>

			<StaticSection heading="7. User-generated content">
				<p>
					Reviews, questions, photos, and reels you publish on MaterialHub
					must be your own work, truthful, and free of unlawful or
					offensive content. You grant MaterialHub a non-exclusive,
					royalty-free, worldwide licence to display, reproduce and
					promote your content in connection with the marketplace.
				</p>
				<p>
					We may moderate, edit or remove content that breaches these
					terms or our community guidelines.
				</p>
			</StaticSection>

			<StaticSection heading="8. Intellectual property">
				<p>
					MaterialHub, the MaterialHub logo, and the storefront design are
					owned by MaterialHub FZ-LLC. Brand names and product photography
					belong to the respective vendors and rights holders. You may
					not scrape, mirror, or reuse any of this content without
					written permission.
				</p>
			</StaticSection>

			<StaticSection heading="9. Account suspension">
				<p>
					We may suspend or close accounts engaged in fraud, chargeback
					abuse, harassment of vendors or customer-care staff, or
					systematic violation of these terms. Pending orders may be
					cancelled and refunded.
				</p>
			</StaticSection>

			<StaticSection heading="10. Liability">
				<p>
					Where permitted by UAE law, MaterialHub&rsquo;s aggregate
					liability for any claim relating to an order is capped at the
					value of that order. We are not liable for indirect or
					consequential losses, or for vendor performance beyond the
					marketplace guarantees expressly stated in these terms.
				</p>
			</StaticSection>

			<StaticSection heading="11. Governing law">
				<p>
					These terms are governed by the laws of the United Arab
					Emirates. Disputes are subject to the exclusive jurisdiction
					of the Dubai Courts, without prejudice to any non-waivable
					consumer rights in your emirate of residence.
				</p>
			</StaticSection>

			<StaticSection heading="12. Changes">
				<p>
					We may update these terms from time to time. The current
					version is always on this page, with the date updated. For
					material changes we will email you at least 14 days before
					they take effect.
				</p>
			</StaticSection>

			<StaticSection heading="13. Contact">
				<p>
					Questions on these terms:{" "}
					<a
						href="mailto:info@materialhubuae.com"
						className="text-nl-amber hover:underline"
					>
						info@materialhubuae.com
					</a>
					.
				</p>
			</StaticSection>
		</StaticPageLayout>
	);
}
