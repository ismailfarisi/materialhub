import { LayoutRenderer } from "@/components/layout/layout-renderer";
import { PreviewBanner } from "@/components/layout/preview-banner";
import { VendorStorefrontHero } from "@/components/vendor/vendor-storefront-hero";
import { apiServer } from "@/lib/api-server";
import { buildAlternates } from "@/lib/seo/alternates";
import type { Metadata } from "next";
import { buttonVariants } from "@/components/swatch";
import { getTranslations, setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { headers } from "next/headers";
import { notFound, permanentRedirect } from "next/navigation";
import { UUID_RE, fetchVendor } from "./data";

export const revalidate = 300;

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
		// The root layout's title template appends the site name.
		title: vendor.name,
		description:
			vendor.description ?? `Materials from ${vendor.name}, a supplier on MaterialHub.`,
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
	const t = await getTranslations({ locale, namespace: "browse" });
	const sections = layout.sections || [];

	return (
		<>
			{preview_token && <PreviewBanner status="active" />}
			{/* The layout's vendor_context is the chrome the vendor configured
			    (logo, banner); the profile carries the facts (since, rating). */}
			<VendorStorefrontHero vendor={{ ...vendor, ...(layout.vendor_context ?? {}) }} />
			<main className="pt-8 pb-8 md:pt-12 md:pb-12 space-y-10 md:space-y-20">
				{sections.length > 0 ? (
					<LayoutRenderer sections={sections} />
				) : (
					<div className="mx-auto max-w-[1400px] px-4 md:px-8">
						<div className="grid justify-items-start gap-3 rounded-md border border-dashed border-nl-cacao/25 bg-nl-pearl/60 px-5 py-10 md:px-8 md:py-14">
							<h2 className="m-0 font-display text-[19px] font-semibold tracking-[-0.01em] text-nl-cacao">
								{t("storefrontEmptyTitle")}
							</h2>
							<p className="m-0 max-w-[56ch] text-[15px] text-nl-russet">
								{t("storefrontEmptyHint", { name: vendor.name })}
							</p>
							<Link
								href={`/${locale}/search?vendor=${encodeURIComponent(vendor.slug ?? slug)}`}
								className={`${buttonVariants({ variant: "primary" })} mt-2`}
							>
								{t("seeSupplierListings")}
							</Link>
						</div>
					</div>
				)}
			</main>
		</>
	);
}
