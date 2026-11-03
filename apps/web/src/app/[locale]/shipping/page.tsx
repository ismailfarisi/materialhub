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
	title: "Shipping and delivery | MaterialHub",
	description:
		"How MaterialHub delivers across the UAE: delivery options, free standard shipping over AED 150, multi-supplier orders and tracking.",
};

const HEADINGS = [
	"Delivery options",
	"Free standard shipping",
	"Orders from several suppliers",
	"Tracking",
	"Where we deliver",
];

export default async function ShippingPage() {
	const locale = await getLocale();
	const [options, free, multi, tracking, where] = HEADINGS;
	return (
		<StaticPageLayout
			contentLang="en"
			eyebrow="Help"
			title="Shipping and delivery"
			intro="Every supplier ships its own part of your order. You see the delivery options and the price for each shipment at checkout, before you pay."
			label={[
				{ label: "Delivers to", value: "UAE addresses" },
				{ label: "Free standard", value: "Over AED 150" },
				{ label: "Tracking", value: "Per shipment" },
			]}
			contents={contentsFrom(HEADINGS)}
		>
			<StaticSection heading={options}>
				<p>
					Which options you get depends on the supplier and your address.
					Checkout only offers the ones available for each shipment.
				</p>
				<div className="mt-6">
					<SpecTable
						caption="Delivery options and the payment methods they accept"
						columns={["Option", "What it is", "Pay with"]}
						rows={[
							["Standard", "Delivery to your address.", "Card, Tabby, Tamara, cash on delivery"],
							["Express", "Faster delivery, where the supplier offers it.", "Card, Tabby, Tamara"],
							["Same day", "Delivered the day you order, where the supplier offers it.", "Card, Tabby, Tamara"],
							["Pickup", "Collect from the supplier, where offered.", "Card, Tabby, Tamara, cash on delivery"],
						]}
					/>
				</div>
			</StaticSection>

			<StaticSection heading={free}>
				<p>
					Standard shipping is free on orders over AED 150. Below that, the
					standard rate for each shipment is shown at checkout. Express and
					same-day delivery are charged at the rate shown.
				</p>
			</StaticSection>

			<StaticSection heading={multi}>
				<p>
					MaterialHub is a marketplace, so a cart can hold material from
					several suppliers. You pay once, and each supplier sends its items
					as a separate shipment, priced separately at checkout and arriving
					on its own schedule.
				</p>
			</StaticSection>

			<StaticSection heading={tracking}>
				<p>
					Each shipment has its own status and tracking in{" "}
					<Link href={`/${locale}/account/orders`}>My orders</Link>.
				</p>
			</StaticSection>

			<StaticSection heading={where}>
				<p>
					We deliver to addresses in the United Arab Emirates. For a large or
					regular trade delivery, <Link href={`/${locale}/contact`}>contact us</Link>{" "}
					with the material, quantity and address.
				</p>
			</StaticSection>
		</StaticPageLayout>
	);
}
