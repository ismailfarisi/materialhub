import { SpecTable } from "@/components/content/spec-table";
import {
	StaticPageLayout,
	StaticSection,
	contentsFrom,
} from "@/components/layout/static-page-layout";
import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import Link from "next/link";

export const metadata: Metadata = {
	title: "Returns and refunds | MaterialHub",
	description:
		"Request a return within 7 days of delivery: what qualifies, how to start a return, what happens next and how refunds are paid.",
};

const HEADINGS = [
	"What you can return",
	"What can’t be returned",
	"How to start a return",
	"What happens next",
	"Refunds",
	"Damaged or wrong items",
];

export default async function ReturnsPage() {
	const locale = await getLocale();
	const [can, cannot, start, next, refunds, damaged] = HEADINGS;
	return (
		<StaticPageLayout
			contentLang="en"
			eyebrow="Help"
			title="Returns and refunds"
			intro="You have 7 days from delivery to request a return. Start it from your order, and the supplier who sold the item handles it with us."
			label={[
				{ label: "Return window", value: "7 days" },
				{ label: "Counted from", value: "Delivery" },
				{ label: "Start from", value: "My orders" },
				{ label: "Refund to", value: "Original payment" },
			]}
			contents={contentsFrom(HEADINGS)}
		>
			<StaticSection heading={can}>
				<ul>
					<li>Unopened material in its original packaging, with seals and wrappers intact.</li>
					<li>Anything that arrived damaged, faulty or not as described, opened or not.</li>
					<li>The wrong item, colour, size or quantity.</li>
				</ul>
			</StaticSection>

			<StaticSection heading={cannot}>
				<ul>
					<li>
						Material that has been cut to size, opened or partly used: sheets,
						rolls, cloth and leather once unwrapped, adhesives once the seal is
						broken.
					</li>
					<li>Made-to-order, printed or personalised items.</li>
					<li>Items marked &ldquo;final sale&rdquo; on the product page.</li>
				</ul>
			</StaticSection>

			<StaticSection heading={start}>
				<ol>
					<li>
						Open <Link href={`/${locale}/account/orders`}>My orders</Link> and
						choose the order.
					</li>
					<li>Select the items to return and the reason. Add details and photos if something arrived damaged.</li>
					<li>Submit the request. You&rsquo;ll see its status on the order and in <Link href={`/${locale}/account/returns`}>Returns</Link>.</li>
				</ol>
			</StaticSection>

			<StaticSection heading={next}>
				<SpecTable
					caption="Return statuses"
					columns={["Status", "What it means"]}
					rows={[
						["Requested", "Your request is with the supplier and MaterialHub."],
						["Approved", "The return is accepted. You’ll get instructions to send it back."],
						["Rejected", "The return doesn’t qualify. The reason is shown on the request."],
						["Shipped back", "The item is on its way back to the supplier."],
						["Received", "The supplier has the item and is checking its condition."],
						["Refunded", "The refund has been issued to your original payment method."],
					]}
				/>
			</StaticSection>

			<StaticSection heading={refunds}>
				<p>
					Refunds go back to the payment method you used: your card, or your
					Tabby or Tamara plan. For cash-on-delivery orders, the refund method
					is shown on your return. How long a refund takes to show depends on
					your bank or provider.
				</p>
				<p>
					We don&rsquo;t swap items directly. Return the original and place a
					new order for the one you need.
				</p>
			</StaticSection>

			<StaticSection heading={damaged}>
				<p>
					Tell us as soon as you can, with your order number and a photo of the
					problem, by starting a return or through{" "}
					<Link href={`/${locale}/contact`}>customer care</Link>. You
					won&rsquo;t pay to send back an item that arrived damaged, faulty or
					wrong.
				</p>
			</StaticSection>
		</StaticPageLayout>
	);
}
