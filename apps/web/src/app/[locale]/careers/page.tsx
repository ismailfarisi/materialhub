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
	const t = await getTranslations({ locale, namespace: "content.careers" });
	return {
		title: t("meta.title"),
		description: t("meta.description"),
		alternates: buildAlternates(locale, "/careers"),
	};
}

const VALUES = ["buyer", "suppliers", "uae", "teams"] as const;
const HIRE_STEPS = ["intro", "working", "team", "decision"] as const;

export default async function CareersPage({ params }: Props) {
	const { locale } = await params;
	setRequestLocale(locale);
	const t = await getTranslations({ locale, namespace: "content.careers" });
	const tags = staticRichTags(locale);
	const headings = ["how", "values", "roles", "hire"].map((k) => t(`headings.${k}`));
	const [how, values, roles, hire] = headings;

	return (
		<StaticPageLayout
			eyebrow={t("eyebrow")}
			title={t("title")}
			intro={t("intro")}
			contents={contentsFrom(headings)}
		>
			<StaticSection heading={how}>
				<p>{t("how.p1")}</p>
			</StaticSection>

			<StaticSection heading={values}>
				<dl className="not-prose m-0 grid max-w-[76ch] border-t-2 border-nl-cacao">
					{VALUES.map((v) => (
						<div
							key={v}
							className="grid gap-1 md:grid-cols-[minmax(0,15rem)_1fr] md:gap-8 py-4 border-b border-nl-cacao/12"
						>
							<dt className="font-semibold text-nl-cacao">{t(`values.${v}.t`)}</dt>
							<dd className="m-0 text-nl-cacao/85">{t(`values.${v}.d`)}</dd>
						</div>
					))}
				</dl>
			</StaticSection>

			<StaticSection heading={roles}>
				<p>{t("roles.p1")}</p>
				<p>{t.rich("roles.p2", tags)}</p>
			</StaticSection>

			<StaticSection heading={hire}>
				<ol>
					{HIRE_STEPS.map((k) => (
						<li key={k}>{t.rich(`hire.${k}`, tags)}</li>
					))}
				</ol>
			</StaticSection>
		</StaticPageLayout>
	);
}
