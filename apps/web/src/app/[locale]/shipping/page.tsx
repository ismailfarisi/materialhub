import type { Metadata } from "next";
import {
	StaticPageLayout,
	StaticSection,
} from "@/components/layout/static-page-layout";

export const metadata: Metadata = {
	title: "Shipping Info — MaterialHub",
	description:
		"MaterialHub shipping zones, delivery times, fees and cut-offs for orders across the UAE.",
};

const ZONES = [
	{
		zone: "Dubai · Abu Dhabi · Sharjah",
		eta: "Same day before 4pm, next day after",
		std: "Free over AED 150 / AED 15",
		exp: "AED 29 same-day",
	},
	{
		zone: "Ajman · Ras Al Khaimah · Umm Al Quwain · Fujairah",
		eta: "1–2 working days",
		std: "Free over AED 150 / AED 15",
		exp: "Not available",
	},
	{
		zone: "Al Ain · remote addresses",
		eta: "2–3 working days",
		std: "Free over AED 150 / AED 15",
		exp: "Not available",
	},
];

export default function ShippingPage() {
	return (
		<StaticPageLayout
			eyebrow="Shipping"
			title="Hyperlocal delivery, across the UAE."
			intro="Most orders leave the warehouse within hours. Same-day arrives same-day in-city; the rest of the country lands within a few working days."
		>
			<StaticSection heading="Delivery zones & fees">
				<div className="not-prose overflow-x-auto">
					<table className="w-full text-[14px] border-collapse border-y border-nl-cacao/15">
						<thead>
							<tr className="text-[10px] tracking-[0.18em] uppercase text-nl-russet/80 text-left">
								<th className="py-3 pe-4 font-medium">Zone</th>
								<th className="py-3 pe-4 font-medium">ETA</th>
								<th className="py-3 pe-4 font-medium">Standard</th>
								<th className="py-3 font-medium">Same-day</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-nl-cacao/10">
							{ZONES.map((z) => (
								<tr key={z.zone} className="align-top">
									<td className="py-4 pe-4 text-nl-cacao font-medium">
										{z.zone}
									</td>
									<td className="py-4 pe-4 text-nl-russet">
										{z.eta}
									</td>
									<td className="py-4 pe-4 text-nl-russet">
										{z.std}
									</td>
									<td className="py-4 text-nl-russet">{z.exp}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</StaticSection>

			<StaticSection heading="Free shipping">
				<p>
					Standard shipping is free on every order of AED 150 or more,
					anywhere in the UAE. The threshold is applied after discounts
					and before VAT, on the subtotal of in-stock items.
				</p>
			</StaticSection>

			<StaticSection heading="Same-day delivery">
				<p>
					Available in Dubai, Abu Dhabi and Sharjah for items marked
					&ldquo;Same-day eligible&rdquo; on the product page. Place the
					order before 4pm GST and your courier will arrive by 9pm the
					same day. Orders after 4pm ship next-day.
				</p>
			</StaticSection>

			<StaticSection heading="Multi-vendor orders">
				<p>
					MaterialHub is a multi-vendor marketplace. If your cart includes
					items from more than one vendor, you may receive separate
					shipments arriving on slightly different schedules — each with
					its own tracking link. You are only charged shipping once.
				</p>
			</StaticSection>

			<StaticSection heading="What we ship internationally">
				<p>
					MaterialHub currently ships to UAE addresses only. We&rsquo;re
					expanding across the GCC — sign up to our newsletter for
					launch news in Saudi Arabia, Kuwait, Bahrain, Qatar and Oman.
				</p>
			</StaticSection>
		</StaticPageLayout>
	);
}
