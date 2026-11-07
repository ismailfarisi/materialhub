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
	const t = await getTranslations({ locale, namespace: "content.privacy" });
	return {
		title: t("meta.title"),
		description: t("meta.description"),
		alternates: buildAlternates(locale, "/privacy"),
	};
}

const SECTIONS = [
	"who",
	"collect",
	"use",
	"sharing",
	"transfers",
	"retention",
	"rights",
	"cookies",
	"children",
	"changes",
] as const;

const COLLECT = ["account", "order", "payment", "usage", "comms"] as const;
const USE = ["orders", "account", "personalise", "messages", "fraud"] as const;

export default async function PrivacyPage({ params }: Props) {
	const { locale } = await params;
	setRequestLocale(locale);
	const t = await getTranslations({ locale, namespace: "content.privacy" });
	const tags = staticRichTags(locale);
	const h = (k: (typeof SECTIONS)[number]) => t(`headings.${k}`);

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
			contents={contentsFrom(SECTIONS.map(h))}
		>
			<StaticSection heading={h("who")}>
				<p>{t("who.p1")}</p>
			</StaticSection>

			<StaticSection heading={h("collect")}>
				<ul>
					{COLLECT.map((k) => (
						<li key={k}>{t.rich(`collect.${k}`, tags)}</li>
					))}
				</ul>
			</StaticSection>

			<StaticSection heading={h("use")}>
				<ul>
					{USE.map((k) => (
						<li key={k}>{t(`use.${k}`)}</li>
					))}
				</ul>
			</StaticSection>

			<StaticSection heading={h("sharing")}>
				<p>{t("sharing.p1")}</p>
				<p>{t("sharing.p2")}</p>
			</StaticSection>

			<StaticSection heading={h("transfers")}>
				<p>{t("transfers.p1")}</p>
			</StaticSection>

			<StaticSection heading={h("retention")}>
				<p>{t("retention.p1")}</p>
			</StaticSection>

			<StaticSection heading={h("rights")}>
				<p>{t.rich("rights.p1", tags)}</p>
				<p>{t("rights.p2")}</p>
			</StaticSection>

			<StaticSection heading={h("cookies")}>
				<p>{t("cookies.p1")}</p>
			</StaticSection>

			<StaticSection heading={h("children")}>
				<p>{t.rich("children.p1", tags)}</p>
			</StaticSection>

			<StaticSection heading={h("changes")}>
				<p>{t("changes.p1")}</p>
			</StaticSection>
		</StaticPageLayout>
	);
}
