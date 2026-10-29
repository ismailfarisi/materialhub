import { apiServer } from "@/lib/api-server";
import type { ServiceSearchResponse } from "@/lib/booking/types";
import { buildServiceListingParams } from "@/components/services/service-listing-params";
import { computeActiveServiceFilters } from "@/components/services/service-filter-state";
import { ServiceFilterSidebar } from "@/components/services/service-filter-sidebar";
import { ServiceGrid } from "@/components/services/service-grid";
import { buildAlternates } from "@/lib/seo/alternates";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

// Matches the category listing's posture. Availability is not rendered here,
// but facet counts move whenever a vendor edits coverage, so a cached shell
// would go stale in a way that is confusing rather than merely old.
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string>>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "service.listing" });
  return {
    title: t("title"),
    description: t("intro"),
    // Self-referencing canonical to the clean path so filter permutations
    // aren't indexed as duplicates.
    alternates: buildAlternates(locale, "/services"),
  };
}

export default async function ServicesPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const filters = await searchParams;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "service.listing" });
  const server = await apiServer(locale);

  // Facets come back keyed by SLUG. Delivery zones supply the display names,
  // so the area filter reads "Dubai Marina" rather than "dubai-marina". This
  // endpoint is already public and unauthenticated, and the booking checkout
  // already uses it for exactly this slug -> name job.
  const zones: Array<{ slug: string; name: string }> = await server
    .get("/shipping/delivery-zones")
    .then((r) => r.data.data ?? [])
    // I3b: degrade to an empty zone list (area facet falls back to raw
    // slugs) rather than 500ing the whole page, but log so a real backend
    // outage here is distinguishable from "no delivery zones configured".
    .catch((err) => {
      console.error("[services page] GET /shipping/delivery-zones failed:", err);
      return [];
    });
  const zoneNameBySlug = new Map(zones.map((z) => [z.slug, z.name]));

  const res: ServiceSearchResponse = await server
    .get("/services", { params: buildServiceListingParams(filters, 24, locale) })
    .then((r) => ({
      data: r.data.data ?? [],
      total: r.data.total ?? 0,
      page: r.data.page ?? 1,
      limit: r.data.limit ?? 24,
      facets: r.data.facets ?? {
        areas: [],
        categories: [],
        visitTypes: [],
        paymentModes: [],
        vendors: [],
      },
    }))
    // An empty listing is a legitimate state (there are no published services
    // yet), so a failure degrades to the empty view rather than a 500 — but
    // log it, so a real GET /services outage (or a validation 422 from an
    // out-of-range filter) is distinguishable from a genuinely empty catalog
    // instead of silently rendering "No services yet".
    .catch((err) => {
      console.error("[services page] GET /services failed:", err);
      return {
        data: [],
        total: 0,
        page: 1,
        limit: 24,
        facets: {
          areas: [],
          categories: [],
          visitTypes: [],
          paymentModes: [],
          vendors: [],
        },
      };
    });

  const facetConfig = {
    // Fall back to the slug if a zone was deleted after indexing — a readable
    // slug beats an empty label.
    areas: res.facets.areas.map((f) => ({
      value: f.value,
      label: zoneNameBySlug.get(f.value) ?? f.value,
      count: f.count,
    })),
    categories: res.facets.categories.map((f) => ({
      value: f.value,
      label: f.value,
      count: f.count,
    })),
    priceRange: { min: 0, max: 100000 },
  };

  const { count: activeCount } = computeActiveServiceFilters(
    facetConfig,
    new URLSearchParams(filters as Record<string, string>),
  );

  return (
    <div className="mx-auto max-w-[1400px] py-4 px-4">
      <h1 className="font-serif text-3xl text-nl-cacao mb-1">{t("title")}</h1>
      <p className="text-sm text-nl-russet mb-6">{t("intro")}</p>

      <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-8">
        <ServiceFilterSidebar config={facetConfig} />

        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-nl-russet mb-4">
            {t("results", { count: res.total })}
            {activeCount > 0 ? ` · ${activeCount}` : ""}
          </p>

          {res.data.length === 0 ? (
            <div className="py-16 text-center">
              <p className="font-serif text-xl text-nl-cacao mb-2">{t("emptyTitle")}</p>
              <p className="text-sm text-nl-russet">{t("emptyHint")}</p>
            </div>
          ) : (
            <ServiceGrid services={res.data} />
          )}
        </div>
      </div>
    </div>
  );
}
