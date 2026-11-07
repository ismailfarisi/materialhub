import {
	StaticPageLayout,
	StaticSection,
	contentsFrom,
} from "@/components/layout/static-page-layout";
import { staticRichTags } from "@/components/layout/static-rich-tags";
import { buildAlternates } from "@/lib/seo/alternates";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

interface Props {
	params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { locale } = await params;
	const t = await getTranslations({ locale, namespace: "content.terms" });
	return {
		title: t("meta.title"),
		description: t("meta.description"),
		alternates: buildAlternates(locale, "/terms"),
	};
}

/** Sections in order, with the paragraph keys each one holds under `content.terms.<section>`. */
const SECTIONS = [
	["contract", ["p1"]],
	["eligibility", ["p1"]],
	["orders", ["p1", "p2"]],
	["payment", ["p1"]],
	["shipping", ["p1"]],
	["vendors", ["p1"]],
	["ugc", ["p1", "p2"]],
	["ip", ["p1"]],
	["suspension", ["p1"]],
	["liability", ["p1"]],
	["law", ["p1"]],
	["changes", ["p1"]],
	["contact", ["p1"]],
] as const;

export default async function TermsPage({ params }: Props) {
	const { locale } = await params;
	setRequestLocale(locale);
	const t = await getTranslations({ locale, namespace: "content.terms" });
	const tags = staticRichTags(locale);
	const headings = SECTIONS.map(([k]) => t(`headings.${k}`));

	return (
		<StaticPageLayout
			eyebrow={t("eyebrow")}
			title={t("title")}
			intro={t("intro")}
			label={[
				{ label: t("label.updated"), value: t("label.updatedValue") },
				{ label: t("label.operator"), value: t("label.operatorValue") },
				{ label: t("label.law"), value: t("label.lawValue") },
			]}
			contents={contentsFrom(headings)}
		>
			{SECTIONS.map(([section, paragraphs], i) => (
				<StaticSection key={section} heading={headings[i]}>
					{paragraphs.map((p) => (
						<p key={p}>{t.rich(`${section}.${p}`, tags)}</p>
					))}
				</StaticSection>
			))}
		</StaticPageLayout>
	);
}
