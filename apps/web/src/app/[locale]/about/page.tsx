import { CategoryStocks } from "@/components/content/category-stocks";
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
	const t = await getTranslations({ locale, namespace: "content.about" });
	return {
		title: t("meta.title"),
		description: t("meta.description"),
		alternates: buildAlternates(locale, "/about"),
	};
}

const BUYING = ["specs", "suppliers", "pay", "delivery"] as const;

export default async function AboutPage({ params }: Props) {
	const { locale } = await params;
	setRequestLocale(locale);
	const t = await getTranslations({ locale, namespace: "content.about" });
	const tags = staticRichTags(locale);
	const headings = ["why", "categories", "buying", "who", "where"].map((k) => t(`headings.${k}`));
	const [why, categories, buying, who, where] = headings;

	return (
		<StaticPageLayout
			eyebrow={t("eyebrow")}
			title={t("title")}
			intro={t("intro")}
			label={[
				{ label: t("label.basedIn"), value: t("label.basedInValue") },
				{ label: t("label.categories"), value: t("label.categoriesValue") },
				{ label: t("label.languages"), value: t("label.languagesValue") },
				{ label: t("label.pricesIn"), value: t("label.pricesInValue") },
			]}
			contents={contentsFrom(headings)}
		>
			<StaticSection heading={why}>
				<p>{t("why.p1")}</p>
				<p>{t("why.p2")}</p>
			</StaticSection>

			<StaticSection heading={categories}>
				<p>{t("categories.p1")}</p>
				<CategoryStocks locale={locale} columns="two" className="mt-6 max-w-[760px]" />
			</StaticSection>

			<StaticSection heading={buying}>
				<ul>
					{BUYING.map((k) => (
						<li key={k}>{t.rich(`buying.${k}`, tags)}</li>
					))}
				</ul>
			</StaticSection>

			<StaticSection heading={who}>
				<p>{t("who.p1")}</p>
				<p>{t.rich("who.p2", tags)}</p>
			</StaticSection>

			<StaticSection heading={where}>
				<p>{t.rich("where.p1", tags)}</p>
			</StaticSection>
		</StaticPageLayout>
	);
}
