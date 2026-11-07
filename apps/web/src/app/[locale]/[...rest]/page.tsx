import { StaticPageLayout, StaticSection } from "@/components/layout/static-page-layout";
import { TTL, publicGet } from "@/lib/api-public";
import { type CmsPage, cmsSlugFromPath, sanitizeCmsHtml } from "@/lib/cms-content";
import { absoluteUrl } from "@/lib/seo/alternates";
import { cn } from "@/lib/utils";
import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

interface Props {
	params: Promise<{ locale: string; rest: string[] }>;
}

/** Headings and media inside admin-authored page bodies (the reading prose covers text). */
const cmsBody = cn(
	"[&_h2]:font-display [&_h2]:font-semibold [&_h2]:text-[clamp(22px,2.4vw,28px)] [&_h2]:leading-[1.12] [&_h2]:mt-10 [&_h2]:mb-4",
	"[&_h3]:font-semibold [&_h3]:text-[19px] [&_h3]:mt-8 [&_h3]:mb-3",
	"[&_img]:max-w-full [&_img]:h-auto [&_img]:my-6",
	"[&_blockquote]:border-s-2 [&_blockquote]:border-nl-cacao/20 [&_blockquote]:ps-4 [&_blockquote]:text-nl-russet",
	"[&_table]:my-6 [&_table]:w-full [&_table]:text-sm [&_th]:text-start [&_th]:border-b [&_th]:border-nl-cacao/15 [&_th]:py-2 [&_td]:border-b [&_td]:border-nl-cacao/10 [&_td]:py-2",
);

/**
 * Published CMS pages by slug (`/en/<slug>`). Static routes (about, faq,
 * terms, …) match first, so this only sees paths no other route owns; anything
 * that isn't a published page still renders the localised not-found page.
 */
async function loadPage(rest: string[] | undefined, locale: string): Promise<CmsPage | null> {
	const slug = cmsSlugFromPath(rest);
	if (!slug) return null;
	return publicGet<CmsPage>(`/pages/${encodeURIComponent(slug)}`, {
		revalidate: TTL.cmsContent,
		tags: ["cms-pages", `cms-page:${slug}`],
		locale,
	});
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { locale, rest } = await params;
	const page = await loadPage(rest, locale);
	if (!page) return {};
	return {
		title: page.meta_title || page.title,
		description: page.meta_description || undefined,
		alternates: { canonical: absoluteUrl(locale, `/${page.slug}`) },
	};
}

export default async function CmsPageRoute({ params }: Props) {
	const { locale, rest } = await params;
	setRequestLocale(locale);
	const page = await loadPage(rest, locale);
	if (!page) notFound();

	const html = sanitizeCmsHtml(page.content);
	return (
		<StaticPageLayout
			title={page.title}
			intro={page.meta_description || undefined}
			contentLang={page.locale && page.locale !== locale ? page.locale : undefined}
		>
			<StaticSection>
				{/* biome-ignore lint/security/noDangerouslySetInnerHtml: sanitised by sanitizeCmsHtml */}
				<div className={cmsBody} dangerouslySetInnerHTML={{ __html: html }} />
			</StaticSection>
		</StaticPageLayout>
	);
}
