// Breadcrumbs for the dashboard shell. Every intermediate crumb links to its
// path, except paths that have no page of their own (group folders such as
// /catalog or /settings, and /cms/pages/:id which only has /edit below it):
// those render as plain text instead of linking to a 404.

export interface Breadcrumb {
	label: string;
	href?: string;
}

const UUID_OR_ID = "[^/]+";
/** Route folders with no page.tsx of their own (keep in sync with app/(dashboard)). */
const PATHS_WITHOUT_PAGE: RegExp[] = [
	/^\/catalog$/,
	/^\/bulk$/,
	/^\/cms$/,
	/^\/settings$/,
	new RegExp(`^/cms/layouts/${UUID_OR_ID}$`),
	new RegExp(`^/cms/pages/${UUID_OR_ID}$`),
	new RegExp(`^/integrations/${UUID_OR_ID}$`),
];

function hasPage(segments: string[]): boolean {
	const path = `/${segments.join("/")}`;
	return !PATHS_WITHOUT_PAGE.some((re) => re.test(path));
}

const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEGMENT_LABEL_OVERRIDES: Record<string, string> = {
	cms: "CMS",
	seo: "SEO",
	kyc: "KYC",
	bnpl: "BNPL",
	"shipping-rates": "Shipping Rates",
	"shipping-contribution-tiers": "Shipping Contribution Tiers",
	"shipping-providers": "Shipping Providers",
	"public-holidays": "Public Holidays",
	"payment-methods": "Payment Methods",
	"cart-abandonment": "Cart Abandonment",
	"audit-log": "Audit Log",
	"role-permissions": "Role Permissions",
	"header-navigation": "Header Navigation",
	"brand-submissions": "Brand Submissions",
	"eco-declarations": "Plastic-ban Declarations",
	"sales-channels": "Sales Channels",
	"pending-writes": "Pending Writes",
};

export function labelForSegment(seg: string, prev?: string) {
	if (SEGMENT_LABEL_OVERRIDES[seg]) return SEGMENT_LABEL_OVERRIDES[seg];
	if (UUID_RE.test(seg)) {
		// Friendlier label than a raw UUID. Prev segment hints at the entity.
		if (prev === "layouts") return "Layout";
		if (prev === "pages") return "Page";
		if (prev === "vendors") return "Vendor";
		if (prev === "products") return "Product";
		if (prev === "orders") return "Order";
		if (prev === "business-accounts") return "Business account";
		return "Detail";
	}
	return seg
		.split("-")
		.map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
		.join(" ");
}

export function getBreadcrumbs(pathname: string): Breadcrumb[] {
	const segments = pathname.split("/").filter(Boolean);
	if (segments.length === 0) return [{ label: "Dashboard" }];
	return [
		{ label: "Dashboard", href: "/" },
		...segments.map((seg, i) => ({
			label: labelForSegment(seg, segments[i - 1]),
			href:
				i < segments.length - 1 && hasPage(segments.slice(0, i + 1))
					? `/${segments.slice(0, i + 1).join("/")}`
					: undefined,
		})),
	];
}

