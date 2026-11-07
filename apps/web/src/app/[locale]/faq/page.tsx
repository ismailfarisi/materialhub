import { type FaqItem, FaqAccordion } from "@/components/content/faq-accordion";
import {
	StaticPageLayout,
	StaticSection,
	contentsFrom,
} from "@/components/layout/static-page-layout";
import { staticRichTags } from "@/components/layout/static-rich-tags";
import { buildAlternates } from "@/lib/seo/alternates";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import Link from "next/link";

interface Props {
	params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { locale } = await params;
	const t = await getTranslations({ locale, namespace: "content.faq" });
	return {
		title: t("meta.title"),
		description: t("meta.description"),
		alternates: buildAlternates(locale, "/faq"),
	};
}

/** Groups and their questions, in page order; copy lives in `content.faq.groups`. */
const GROUPS = {
	ordering: ["whoFrom", "bySpec", "account", "samples"],
	delivery: ["where", "cost", "tracking"],
	returns: ["what", "refund"],
	payment: ["methods", "card", "currency"],
	selling: ["become", "paid"],
} as const;

export default async function FaqPage({ params }: Props) {
	const { locale } = await params;
	setRequestLocale(locale);
	const t = await getTranslations({ locale, namespace: "content.faq" });
	const tags = staticRichTags(locale);

	const data: Array<{ heading: string; items: FaqItem[] }> = Object.entries(GROUPS).map(
		([group, items]) => ({
			heading: t(`groups.${group}.heading`),
			items: items.map((item) => ({
				q: t(`groups.${group}.items.${item}.q`),
				a: <p>{t.rich(`groups.${group}.items.${item}.a`, tags)}</p>,
			})),
		}),
	);

	return (
		<StaticPageLayout
			eyebrow={t("eyebrow")}
			title={t("title")}
			intro={t.rich("intro", {
				contact: (chunks) => (
					<Link
						href={`/${locale}/contact`}
						className="text-nl-cacao underline decoration-nl-cacao/30 underline-offset-[0.2em] hover:decoration-nl-amber"
					>
						{chunks}
					</Link>
				),
			})}
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
