import { apiServer } from "@/lib/api-server";
import type { ServiceOffering, VendorLocation } from "@/lib/booking/types";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { ServiceDetailClient } from "./client";

// Mirrors the product PDP's rendering strategy (force-dynamic, not ISR —
// availability is inherently live data, so a cached shell would go stale
// fast; see apps/web/src/app/[locale]/product/[slug]/page.tsx).
export const dynamic = "force-dynamic";

export async function generateStaticParams() {
  // NOTE: product-service exposes GET /services/:slug only — there is no
  // GET /services list endpoint to pre-build top slugs from (see
  // backend/apps/product-service/src/routes/service.routes.ts). All service
  // PDPs render on-demand.
  return [];
}

interface Props {
  params: Promise<{ locale: string; slug: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const server = await apiServer();
  try {
    const { data } = await server.get(`/services/${slug}`);
    const offering: ServiceOffering = data.data;
    return {
      title: offering.name,
      description: offering.description?.slice(0, 160),
      openGraph: {
        title: offering.name,
        images: offering.media_urls?.[0] ? [offering.media_urls[0]] : [],
      },
    };
  } catch {
    return { title: "Service" };
  }
}

export default async function ServiceDetailPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const server = await apiServer();

  const offering: ServiceOffering | null = await server
    .get(`/services/${slug}`)
    .then((r) => r.data.data)
    .catch(() => null);

  if (!offering || offering.status !== "published") notFound();

  const locations: VendorLocation[] = await server
    .get(`/booking/vendors/${offering.vendor_id}/locations`)
    .then((r) => r.data.data ?? [])
    .catch(() => []);

  return <ServiceDetailClient offering={offering} locations={locations} />;
}
