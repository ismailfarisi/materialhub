import { CategoryStocks } from "@/components/home/category-stocks";
import { HomeLead } from "@/components/home/home-lead";
import { HomeSkeleton } from "@/components/home/home-skeleton";
import { RecentlyViewed } from "@/components/home/recently-viewed";
import { LayoutRenderer } from "@/components/layout/layout-renderer";
import { PreviewBanner } from "@/components/layout/preview-banner";
import { apiServer } from "@/lib/api-server";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { unstable_noStore as noStore } from "next/cache";
import { headers } from "next/headers";
import { Suspense } from "react";

export const metadata: Metadata = {
	title: "MaterialHub — UAE Materials Marketplace",
	description:
		"Shop packaging papers, boards, PU leather, hinges, adhesives, ribbons and decoration materials from trusted local and international vendors across the UAE.",
	openGraph: {
		title: "MaterialHub — UAE Materials Marketplace",
		description:
			"Shop packaging papers, boards, PU leather, hinges, adhesives, ribbons and decoration materials from trusted local and international vendors across the UAE.",
		type: "website",
	},
};

type PreviewStatus = "active" | "expired" | null;

// biome-ignore lint/suspicious/noExplicitAny: untyped CMS layout payload
type Layout = { sections: any[] };

async function getHomePageLayout(
	locale: string,
	previewToken?: string,
	previewLayoutSlug?: string,
): Promise<{ layout: Layout; previewStatus: PreviewStatus; failed: boolean }> {
	if (previewToken) {
		noStore();
	}
	const server = await apiServer();
	const headersList = await headers();
	const ua = headersList.get("user-agent") || "";
	const device = /mobile|android|iphone/i.test(ua) ? "mobile" : "web";

	const params = new URLSearchParams({ locale, device });
	if (previewToken) params.set("preview_token", previewToken);

	const slug = previewToken && previewLayoutSlug ? previewLayoutSlug : "home";

	try {
		const res = await server.get(
			`/layouts/${encodeURIComponent(slug)}/resolve?${params.toString()}`,
		);
		return {
			layout: res.data.data,
			previewStatus: previewToken ? "active" : null,
			failed: false,
		};
		// biome-ignore lint/suspicious/noExplicitAny: axios error shape
	} catch (err: any) {
		if (previewToken && err?.response?.status === 401) {
			try {
				const fallback = await server.get(
					`/layouts/${encodeURIComponent(previewLayoutSlug ?? "home")}/resolve?locale=${locale}&device=${device}`,
				);
				return {
					layout: fallback.data.data,
					previewStatus: "expired",
					failed: false,
				};
			} catch {
				return {
					layout: { sections: [] },
					previewStatus: "expired",
					failed: true,
				};
			}
		}
		// A 404 means no home layout is published yet: an empty page, not an outage.
		return {
			layout: { sections: [] },
			previewStatus: null,
			failed: err?.response?.status !== 404,
		};
	}
}

async function HomeSections({
	locale,
	previewToken,
	previewLayoutSlug,
}: {
	locale: string;
	previewToken?: string;
	previewLayoutSlug?: string;
}) {
	const { layout, previewStatus, failed } = await getHomePageLayout(
		locale,
		previewToken,
		previewLayoutSlug,
	);
	const sections = layout?.sections ?? [];

	const previewInjected = sections.some((s) =>
		// biome-ignore lint/suspicious/noExplicitAny: untyped CMS block
		(s.data?.items ?? []).some((it: any) => it?.preview === true),
	);

	const bannerStatus =
		previewStatus === "expired"
			? "expired"
			: previewToken && !previewInjected && previewStatus === "active"
				? "wrong_page"
				: previewToken && previewInjected
					? "active"
					: null;

	const banner = bannerStatus && (
		<PreviewBanner
			status={bannerStatus}
			bidIdShort={previewToken ? previewToken.slice(0, 8) : undefined}
		/>
	);

	// Empty state: no published sections (or the CMS is down). The lead says
	// what MaterialHub sells and the category row stays the way in.
	if (sections.length === 0) {
		return (
			<div>
				{banner}
				<div className="space-y-10 md:space-y-16">
					<HomeLead locale={locale} unavailable={failed} />
					<CategoryStocks locale={locale} />
				</div>
			</div>
		);
	}

	const t = await getTranslations({ locale, namespace: "home" });
	return (
		<div>
			{banner}
			<h1 className="sr-only">{t("title")}</h1>
			<LayoutRenderer
				sections={sections}
				afterHero={<CategoryStocks locale={locale} />}
			/>
		</div>
	);
}

export default async function HomePage({
	params,
	searchParams,
}: {
	params: Promise<{ locale: string }>;
	searchParams: Promise<{
		preview_token?: string;
		preview_layout_slug?: string;
	}>;
}) {
	const { locale } = await params;
	const { preview_token, preview_layout_slug } = await searchParams;
	setRequestLocale(locale);
	const tc = await getTranslations({ locale, namespace: "common" });

	return (
		<>
			<main className="pb-10 md:pb-16 space-y-10 md:space-y-16">
				<Suspense
					fallback={
						<HomeSkeleton label={tc("loading")}>
							<CategoryStocks locale={locale} />
						</HomeSkeleton>
					}
				>
					<HomeSections
						locale={locale}
						previewToken={preview_token}
						previewLayoutSlug={preview_layout_slug}
					/>
				</Suspense>
				<div className="max-w-[1400px] mx-auto px-4 md:px-8">
					<RecentlyViewed />
				</div>
			</main>

			<script
				type="application/ld+json"
				// biome-ignore lint/security/noDangerouslySetInnerHtml: schema.org JSON-LD payload
				dangerouslySetInnerHTML={{
					__html: JSON.stringify({
						"@context": "https://schema.org",
						"@type": "Organization",
						name: "MaterialHub",
						url: "https://www.materialhubuae.com",
						description:
							"UAE materials marketplace for trusted local and international vendors",
					}),
				}}
			/>
		</>
	);
}
