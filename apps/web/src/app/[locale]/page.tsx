import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { headers } from "next/headers";
import { unstable_noStore as noStore } from "next/cache";
import { apiServer } from "@/lib/api-server";
// CategoryBar import retained for when the Sephora-style header nav lands.
// import { CategoryBar } from "@/components/layout/category-bar";
import { LayoutRenderer } from "@/components/layout/layout-renderer";
import { PreviewBanner } from "@/components/layout/preview-banner";
import { RecentlyViewed } from "@/components/home/recently-viewed";

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

async function getHomePageLayout(locale: string, previewToken?: string, previewLayoutSlug?: string) {
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
    const res = await server.get(`/layouts/${encodeURIComponent(slug)}/resolve?${params.toString()}`);
    return { layout: res.data.data, previewStatus: previewToken ? "active" : null };
  } catch (err: any) {
    if (previewToken && err?.response?.status === 401) {
      try {
        const fallback = await server.get(`/layouts/${encodeURIComponent(previewLayoutSlug ?? "home")}/resolve?locale=${locale}&device=${device}`);
        return { layout: fallback.data.data, previewStatus: "expired" as const };
      } catch {
        return { layout: { sections: [] }, previewStatus: "expired" as const };
      }
    }
    return { layout: { sections: [] }, previewStatus: null };
  }
}

export default async function HomePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ preview_token?: string; preview_layout_slug?: string }>;
}) {
  const { locale } = await params;
  const { preview_token, preview_layout_slug } = await searchParams;
  setRequestLocale(locale);

  const { layout, previewStatus } = await getHomePageLayout(
    locale,
    preview_token,
    preview_layout_slug,
  );
  // Categories fetch removed with the CategoryBar — re-add when the Sephora-style
  // navigation API is available (see comment near the hidden CategoryBar below).

  const previewInjected = (layout.sections ?? []).some((s: any) =>
    (s.data?.items ?? []).some((it: any) => it?.preview === true),
  );

  const bannerStatus =
    previewStatus === "expired"
      ? "expired"
      : preview_token && !previewInjected && previewStatus === "active"
        ? "wrong_page"
        : preview_token && previewInjected
          ? "active"
          : null;

  return (
    <>
      {bannerStatus && (
        <PreviewBanner
          status={bannerStatus}
          bidIdShort={preview_token ? preview_token.slice(0, 8) : undefined}
        />
      )}
      {/*
        Category bar hidden for now. We want a Sephora-style mega-menu hovering
        off the header (top-level categories with featured brands/looks inside),
        which needs a richer navigation API than the current depth=1 tree.
        Re-enable once that endpoint is built:
        <CategoryBar categories={categoriesRes} />
      */}
      <main className="pb-8 md:pb-12 space-y-10 md:space-y-20">
        <LayoutRenderer sections={layout.sections || []} />
        <div className="px-2 md:max-w-[1400px] md:mx-auto md:px-8">
          <RecentlyViewed />
        </div>
      </main>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Organization",
            name: "MaterialHub",
            url: "https://www.materialhubuae.com",
            description: "UAE materials marketplace for trusted local and international vendors",
          }),
        }}
      />
    </>
  );
}

