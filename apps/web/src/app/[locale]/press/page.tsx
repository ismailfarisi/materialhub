import {
	StaticPageLayout,
	StaticSection,
	contentsFrom,
} from "@/components/layout/static-page-layout";
import { staticRichTags } from "@/components/layout/static-rich-tags";
import { MillLabel } from "@/components/swatch";
import { buildAlternates } from "@/lib/seo/alternates";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

interface Props {
	params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { locale } = await params;
	const t = await getTranslations({ locale, namespace: "content.press" });
	return {
		title: t("meta.title"),
		description: t("meta.description"),
		alternates: buildAlternates(locale, "/press"),
	};
}

const FACTS = ["company", "basedIn", "market", "model", "categories", "languages", "payments"] as const;

export default async function PressPage({ params }: Props) {
	const { locale } = await params;
	setRequestLocale(locale);
	const t = await getTranslations({ locale, namespace: "content.press" });
	const tags = staticRichTags(locale);
	const headings = ["short", "facts", "contact", "assets"].map((k) => t(`headings.${k}`));
	const [short, facts, contact, assets] = headings;

	return (
		<StaticPageLayout
			eyebrow={t("eyebrow")}
			title={t("title")}
			intro={t("intro")}
			contents={contentsFrom(headings)}
		>
			<StaticSection heading={short}>
				<p>{t("short.p1")}</p>
			</StaticSection>

			<StaticSection heading={facts}>
				<MillLabel
					specs={FACTS.map((k) => ({ label: t(`facts.${k}`), value: t(`facts.${k}Value`) }))}
					className="max-w-[640px] [&_dd]:text-start md:[&_dd]:text-end"
				/>
			</StaticSection>

			<StaticSection heading={contact}>
				<p>{t.rich("contact.p1", tags)}</p>
			</StaticSection>

			<StaticSection heading={assets}>
				<p>{t.rich("assets.p1", tags)}</p>
			</StaticSection>
		</StaticPageLayout>
	);
}
