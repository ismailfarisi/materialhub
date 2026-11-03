import type { Metadata } from "next";
import {
	StaticPageLayout,
	StaticSection,
	contentsFrom,
} from "@/components/layout/static-page-layout";

export const metadata: Metadata = {
	title: "Privacy policy | MaterialHub",
	description:
		"How MaterialHub collects, uses, stores and protects your personal data, in line with UAE Federal Decree-Law No. 45 of 2021.",
};

const LAST_UPDATED = "25 May 2026";

const HEADINGS = ["1. Who we are", "2. What we collect", "3. Why we use it", "4. Sharing", "5. International transfers", "6. How long we keep it", "7. Your rights", "8. Cookies", "9. Children", "10. Changes"];

export default function PrivacyPage() {
	return (
		<StaticPageLayout
			contentLang="en"
			eyebrow="Legal"
			title="Privacy policy"
			intro="How MaterialHub collects, uses and protects your personal data, in plain language."
			label={[
				{ label: "Updated", value: LAST_UPDATED },
				{ label: "Operator", value: "MaterialHub FZ-LLC" },
				{ label: "Governing law", value: "UAE" },
			]}
			contents={contentsFrom(HEADINGS)}
		>
			<StaticSection heading="1. Who we are">
				<p>
					MaterialHub FZ-LLC (&ldquo;MaterialHub&rdquo;, &ldquo;we&rdquo;,
					&ldquo;us&rdquo;) is registered in Dubai, United Arab Emirates,
					and operates the materialhubuae.com storefront and mobile apps. We
					are the data controller for personal data processed in
					connection with your shopping account and orders.
				</p>
			</StaticSection>

			<StaticSection heading="2. What we collect">
				<ul>
					<li>
						<strong>Account data</strong> —
						name, email, mobile number, password hash, language and
						currency preferences.
					</li>
					<li>
						<strong>Order data</strong> —
						items purchased, prices, shipping address, billing
						address, delivery instructions.
					</li>
					<li>
						<strong>Payment data</strong> —
						card brand and last four digits only; full card details
						are processed by our PCI-compliant payment providers and
						never stored on our servers.
					</li>
					<li>
						<strong>Usage data</strong> —
						pages viewed, search terms, device and browser, IP
						address, approximate location.
					</li>
					<li>
						<strong>Communications</strong>{" "}
						— messages with customer care, reviews you publish,
						questions you post on product pages.
					</li>
				</ul>
			</StaticSection>

			<StaticSection heading="3. Why we use it">
				<ul>
					<li>To process orders, payments, shipping and returns.</li>
					<li>
						To run your account: login, addresses, wishlists and saved
						searches.
					</li>
					<li>
						To personalise the storefront — recommendations, recently
						viewed, what to show on the home page.
					</li>
					<li>
						To send transactional messages (order updates, password
						resets) and, with your consent, marketing emails and push
						notifications.
					</li>
					<li>
						To prevent fraud, abuse and to comply with UAE consumer
						protection and tax law.
					</li>
				</ul>
			</StaticSection>

			<StaticSection heading="4. Sharing">
				<p>
					We share personal data only where necessary, with categories
					of recipients including: vendors (for orders they fulfil),
					payment providers (Stripe, Tabby, Tamara),
					logistics providers, cloud infrastructure (Amazon Web
					Services), analytics and crash reporting tools, and
					authorities where required by law.
				</p>
				<p>
					We do not sell your personal data. Vendors receive only the
					data needed to fulfil and support your order from them.
				</p>
			</StaticSection>

			<StaticSection heading="5. International transfers">
				<p>
					Some personal data is processed outside the UAE by our cloud
					infrastructure and payment providers. Transfers outside the UAE
					rely on adequacy decisions or
					standard contractual clauses as recognised under UAE Federal
					Decree-Law No. 45 of 2021 on the Protection of Personal
					Data.
				</p>
			</StaticSection>

			<StaticSection heading="6. How long we keep it">
				<p>
					Account data is kept while your account is open and for 24
					months after closure, except where longer retention is
					required by tax, accounting or fraud-prevention law (up to
					seven years for invoices). Marketing data is kept until you
					withdraw consent.
				</p>
			</StaticSection>

			<StaticSection heading="7. Your rights">
				<p>
					You have the right to access, correct, delete, restrict or
					port your personal data, and to withdraw consent at any time.
					Email{" "}
					<a href="mailto:info@materialhubuae.com">
						info@materialhubuae.com
					</a>{" "}
					with your request — we respond within 30 days.
				</p>
				<p>
					You also have the right to complain to the UAE Data Office if
					you believe your rights have been breached.
				</p>
			</StaticSection>

			<StaticSection heading="8. Cookies">
				<p>
					We use strictly-necessary cookies to keep you signed in and
					your cart safe. Analytics and marketing cookies are loaded
					only after you accept them in the consent banner. You can
					change your choice any time in account settings.
				</p>
			</StaticSection>

			<StaticSection heading="9. Children">
				<p>
					MaterialHub is intended for users aged 18 and over. We do not
					knowingly collect data from children. If you believe a minor
					has created an account, email{" "}
					<a href="mailto:info@materialhubuae.com">
						info@materialhubuae.com
					</a>{" "}
					and we will remove it.
				</p>
			</StaticSection>

			<StaticSection heading="10. Changes">
				<p>
					When we update this policy, we change the date at the top and,
					for material changes, notify you by email. Continuing to use
					MaterialHub after the effective date means you accept the
					updated policy.
				</p>
			</StaticSection>
		</StaticPageLayout>
	);
}
