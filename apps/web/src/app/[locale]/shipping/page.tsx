import { SpecTable } from "@/components/content/spec-table";
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
	const t = await getTranslations({ locale, namespace: "content.shipping" });
	return {
		title: t("meta.title"),
		description: t("meta.description"),
		alternates: buildAlternates(locale, "/shipping"),
	};
}

const OPTIONS = ["standard", "express", "sameDay", "pickup"] as const;

export default async function ShippingPage({ params }: Props) {
	const { locale } = await params;
	setRequestLocale(locale);
	const t = await getTranslations({ locale, namespace: "content.shipping" });
	const tags = staticRichTags(locale);
	const headings = ["options", "free", "multi", "tracking", "where"].map((k) => t(`headings.${k}`));
	const [options, free, multi, tracking, where] = headings;

	return (
		<StaticPageLayout
			eyebrow={t("eyebrow")}
			title={t("title")}
			intro={t("intro")}
			label={[
				{ label: t("label.deliversTo"), value: t("label.deliversToValue") },
				{ label: t("label.freeStandard"), value: t("label.freeStandardValue") },
				{ label: t("label.tracking"), value: t("label.trackingValue") },
			]}
			contents={contentsFrom(headings)}
		>
			<StaticSection heading={options}>
				<p>{t("options.p1")}</p>
				<div className="mt-6">
					<SpecTable
						caption={t("options.caption")}
						columns={[t("options.colOption"), t("options.colWhat"), t("options.colPay")]}
						rows={OPTIONS.map((k) => [
							t(`options.${k}.name`),
							t(`options.${k}.what`),
							t(`options.${k}.pay`),
						])}
					/>
				</div>
			</StaticSection>

			<StaticSection heading={free}>
				<p>{t("free.p1")}</p>
			</StaticSection>

			<StaticSection heading={multi}>
				<p>{t("multi.p1")}</p>
			</StaticSection>

			<StaticSection heading={tracking}>
				<p>{t.rich("tracking.p1", tags)}</p>
			</StaticSection>

			<StaticSection heading={where}>
				<p>{t.rich("where.p1", tags)}</p>
			</StaticSection>
		</StaticPageLayout>
	);
}
