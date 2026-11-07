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
	const t = await getTranslations({ locale, namespace: "content.returns" });
	return {
		title: t("meta.title"),
		description: t("meta.description"),
		alternates: buildAlternates(locale, "/returns"),
	};
}

const CAN = ["unopened", "damaged", "wrong"] as const;
const CANNOT = ["cut", "custom", "finalSale"] as const;
const START = ["open", "select", "submit"] as const;
const STATUSES = ["requested", "approved", "rejected", "shippedBack", "received", "refunded"] as const;

export default async function ReturnsPage({ params }: Props) {
	const { locale } = await params;
	setRequestLocale(locale);
	const t = await getTranslations({ locale, namespace: "content.returns" });
	const tags = staticRichTags(locale);
	const headings = ["can", "cannot", "start", "next", "refunds", "damaged"].map((k) => t(`headings.${k}`));
	const [can, cannot, start, next, refunds, damaged] = headings;

	return (
		<StaticPageLayout
			eyebrow={t("eyebrow")}
			title={t("title")}
			intro={t("intro")}
			label={[
				{ label: t("label.window"), value: t("label.windowValue") },
				{ label: t("label.countedFrom"), value: t("label.countedFromValue") },
				{ label: t("label.startFrom"), value: t("label.startFromValue") },
				{ label: t("label.refundTo"), value: t("label.refundToValue") },
			]}
			contents={contentsFrom(headings)}
		>
			<StaticSection heading={can}>
				<ul>
					{CAN.map((k) => (
						<li key={k}>{t(`can.${k}`)}</li>
					))}
				</ul>
			</StaticSection>

			<StaticSection heading={cannot}>
				<ul>
					{CANNOT.map((k) => (
						<li key={k}>{t(`cannot.${k}`)}</li>
					))}
				</ul>
			</StaticSection>

			<StaticSection heading={start}>
				<ol>
					{START.map((k) => (
						<li key={k}>{t.rich(`start.${k}`, tags)}</li>
					))}
				</ol>
			</StaticSection>

			<StaticSection heading={next}>
				<SpecTable
					caption={t("statuses.caption")}
					columns={[t("statuses.colStatus"), t("statuses.colMeaning")]}
					rows={STATUSES.map((k) => [t(`statuses.${k}.s`), t(`statuses.${k}.d`)])}
				/>
			</StaticSection>

			<StaticSection heading={refunds}>
				<p>{t("refunds.p1")}</p>
				<p>{t("refunds.p2")}</p>
			</StaticSection>

			<StaticSection heading={damaged}>
				<p>{t.rich("damaged.p1", tags)}</p>
			</StaticSection>
		</StaticPageLayout>
	);
}
