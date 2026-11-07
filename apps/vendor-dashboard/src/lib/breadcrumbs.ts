/**
 * Dashboard breadcrumbs. Only segments that are real pages get a link (no
 * /bulk, /cms, /products/groups or /products/<id> pages exist), and ids are
 * not shown raw.
 */

/** Static pages, plus `[id]` patterns that have their own page. */
const PAGE_PATTERNS = [
	/^\/$/,
	/^\/(orders|quotes|returns|products|coupons|bids|payouts|integrations|settings|team)$/,
	/^\/(orders|quotes|coupons|integrations)\/[^/]+$/,
	/^\/integrations\/[^/]+\/(activity|mappings)$/,
	/^\/products\/(new|groups\/new)$/,
	/^\/products\/[^/]+\/edit$/,
	/^\/bulk\/(catalog|inventory)$/,
	/^\/cms\/storefront$/,
	/^\/coupons\/new$/,
	/^\/settings\/(delivery|shipping-integrations)$/,
	/^\/settings\/shipping-integrations\/(new|[^/]+\/edit)$/,
	/^\/team\/transfer-ownership$/,
];

const LABELS: Record<string, string> = {
	cms: "Storefront",
	storefront: "Editor",
	bulk: "Bulk",
	"shipping-integrations": "Shipping integrations",
	"transfer-ownership": "Transfer ownership",
	groups: "Colour families",
};

function isId(seg: string): boolean {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(seg) || /^\d+$/.test(seg) || seg.length > 24;
}

function labelFor(seg: string): string {
	if (LABELS[seg]) return LABELS[seg];
	if (isId(seg)) return "Details";
	const words = seg.replace(/-/g, " ");
	return words.charAt(0).toUpperCase() + words.slice(1);
}

export function isDashboardPage(path: string): boolean {
	return PAGE_PATTERNS.some((re) => re.test(path));
}

export function getBreadcrumbs(pathname: string): Array<{ label: string; href?: string }> {
	const segments = pathname.split("/").filter(Boolean);
	if (segments.length === 0) return [{ label: "Dashboard" }];
	return [
		{ label: "Dashboard", href: "/" },
		...segments.map((seg, i) => {
			const path = `/${segments.slice(0, i + 1).join("/")}`;
			const last = i === segments.length - 1;
			return {
				label: labelFor(seg),
				href: !last && isDashboardPage(path) ? path : undefined,
			};
		}),
	];
}
