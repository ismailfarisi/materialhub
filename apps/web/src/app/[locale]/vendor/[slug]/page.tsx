import { LayoutRenderer } from "@/components/layout/layout-renderer";
import { PreviewBanner } from "@/components/layout/preview-banner";
import { VendorStorefrontHero } from "@/components/vendor/vendor-storefront-hero";
import { apiServer } from "@/lib/api-server";
import { buildAlternates } from "@/lib/seo/alternates";
import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { unstable_noStore as noStore } from "next/cache";
import { headers } from "next/headers";
import { notFound, permanentRedirect } from "next/navigation";

const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const revalidate = 300;

async function fetchVendor(slugOrId: string) {
	const server = await apiServer();
	const path = UUID_RE.test(slugOrId)
		? `/vendors/${encodeURIComponent(slugOrId)}/profile`
		: `/vendors/by-slug/${encodeURIComponent(slugOrId)}`;
	try {
		const res = await server.get(path);
		return res.data?.data ?? null;
	} catch {
		return null;
	}
}

async function fetchLayout(
	vendorId: string,
	locale: string,
	previewToken?: string,
) {
	if (previewToken) noStore();
	const server = await apiServer();
	const headersList = await headers();
	const ua = headersList.get("user-agent") || "";
	const device = /mobile|android|iphone/i.test(ua) ? "mobile" : "web";
	const params = new URLSearchParams({
		locale,
		device,
		context_vendor_id: vendorId,
	});
	if (previewToken) params.set("preview_token", previewToken);
	try {
		const res = await server.get(
			`/layouts/vendor-storefront/resolve?${params.toString()}`,
		);
		return res.data.data;
	} catch {
		return { sections: [], owner: undefined };
	}
}

export async function generateMetadata({
	params,
}: { params: Promise<{ slug: string; locale: string }> }): Promise<Metadata> {
	const { slug, locale } = await params;
	const vendor = await fetchVendor(slug);
	if (!vendor) return { title: "Vendor not found" };
	const resolvedSlug = vendor.slug ?? slug;
	return {
		title: `${vendor.name} — MaterialHub`,
		description: vendor.description ?? `Shop ${vendor.name} on MaterialHub`,
		alternates: buildAlternates(locale, `/vendor/${resolvedSlug}`),
		openGraph: {
			title: vendor.name,
			description: vendor.description ?? "",
			type: "website",
		},
	};
}

export default async function VendorStorefrontPage({
	params,
	searchParams,
}: {
	params: Promise<{ locale: string; slug: string }>;
	searchParams: Promise<{ preview_token?: string }>;
}) {
	const { locale, slug } = await params;
	const { preview_token } = await searchParams;
	setRequestLocale(locale);

	const vendor = await fetchVendor(slug);
	if (!vendor) notFound();

	// UUID → 301 to slug
	if (UUID_RE.test(slug) && vendor.slug && vendor.slug !== slug) {
		permanentRedirect(`/${locale}/vendor/${vendor.slug}`);
	}

	const layout = await fetchLayout(vendor.id, locale, preview_token);

	return (
		<>
			{preview_token && <PreviewBanner status="active" />}
			<VendorStorefrontHero vendor={layout.vendor_context ?? vendor} />
			<main className="pb-8 md:pb-12 space-y-10 md:space-y-20">
				<LayoutRenderer sections={layout.sections || []} />
			</main>
		</>
	);
}
