import type { Metadata } from "next";
import {
	StaticPageLayout,
	StaticSection,
	contentsFrom,
} from "@/components/layout/static-page-layout";
import { getLocale } from "next-intl/server";
import Link from "next/link";

export const metadata: Metadata = {
	title: "Terms of service",
	description:
		"The terms that govern your use of MaterialHub — orders, payments, vendor responsibilities, intellectual property and dispute resolution.",
};

const LAST_UPDATED = "25 May 2026";

const HEADINGS = ["1. Who you contract with", "2. Eligibility", "3. Orders & pricing", "4. Payment", "5. Shipping, returns and refunds", "6. Vendor responsibilities", "7. User-generated content", "8. Intellectual property", "9. Account suspension", "10. Liability", "11. Governing law", "12. Changes", "13. Contact"];

export default async function TermsPage() {
	const locale = await getLocale();
	return (
		<StaticPageLayout
			contentLang="en"
			eyebrow="Legal"
			title="Terms of service"
			intro="The rules for using MaterialHub. Opening an account means you accept these terms, so please read them."
			label={[
				{ label: "Updated", value: LAST_UPDATED },
				{ label: "Operator", value: "MaterialHub FZ-LLC" },
				{ label: "Governing law", value: "UAE" },
			]}
			contents={contentsFrom(HEADINGS)}
		>
			<StaticSection heading="1. Who you contract with">
				<p>
					MaterialHub is operated by MaterialHub FZ-LLC, registered in Dubai,
					United Arab Emirates. When you buy a product, your sales
					contract is with the <strong>vendor</strong> listed on the product
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
					Payment is taken when you place an order, by card, by
					instalments with Tabby or Tamara, or in cash on delivery where
					offered. Instalment eligibility is decided by Tabby or Tamara.
					Cash-on-delivery orders are paid to the courier on delivery. We do
					not store full card details.
				</p>
			</StaticSection>

			<StaticSection heading="5. Shipping, returns and refunds">
				<p>
					Shipping timelines, charges and zones are described on the{" "}
					<Link href={`/${locale}/shipping`}>
						Shipping
					</Link>{" "}
					page. Returns and refund eligibility are described on the{" "}
					<Link href={`/${locale}/returns`}>
						Returns
					</Link>{" "}
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
					Reviews, questions and photos you publish on MaterialHub
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
					<a href="mailto:info@materialhubuae.com">
						info@materialhubuae.com
					</a>
					.
				</p>
			</StaticSection>
		</StaticPageLayout>
	);
}
