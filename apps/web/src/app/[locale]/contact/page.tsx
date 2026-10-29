import type { Metadata } from "next";
import {
	StaticPageLayout,
	StaticSection,
} from "@/components/layout/static-page-layout";

export const metadata: Metadata = {
	title: "Contact MaterialHub",
	description:
		"Reach MaterialHub customer care, vendor support, press and partnerships — channels, hours and response times.",
};

const PHONE = "+971 50 301 9357";
const EMAILS = ["info@materialhubuae.com", "help@materialhubuae.com"];

export default function ContactPage() {
	return (
		<StaticPageLayout
			eyebrow="Contact"
			title="Talk to a human at MaterialHub."
			intro="Customer care answers in Arabic and English, seven days a week."
		>
			<StaticSection heading="Get in touch">
				<div className="border border-nl-cacao/10 p-5 bg-white/40 not-prose">
					<p className="text-[14px]">
						<a
							href={`tel:${PHONE.replace(/\s/g, "")}`}
							className="text-nl-cacao hover:underline"
						>
							{PHONE}
						</a>
					</p>
					{EMAILS.map((email) => (
						<p key={email} className="text-[14px] mt-1">
							<a
								href={`mailto:${email}`}
								className="text-nl-amber hover:underline"
							>
								{email}
							</a>
						</p>
					))}
				</div>
			</StaticSection>
		</StaticPageLayout>
	);
}
