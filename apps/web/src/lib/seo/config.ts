import { routing } from "../../../i18n/routing";

export const SITE_URL =
	process.env.NEXT_PUBLIC_SITE_URL || "https://www.materialhubuae.com";

export const API_URL =
	process.env.API_URL ||
	process.env.NEXT_PUBLIC_API_URL ||
	"http://localhost:3000";

// Shared by sitemap.xml/route.ts (index chunk count) and
// sitemaps/[file]/route.ts (product slicing). Must stay identical between the
// two or the index either advertises a child sitemap that 404s, or silently
// drops products off the end of the last chunk.
export const PRODUCTS_PER_SITEMAP = 5000;

// Sourced from the routing config on purpose. A hardcoded list here previously
// drifted to ["en","ar","hi","ur","ml"] and published 404 URLs to Google.
export const LOCALES = routing.locales;
export const DEFAULT_LOCALE = routing.defaultLocale;

// Indexable, crawlable marketing/informational pages. Deliberately excludes
// account, cart, checkout and auth.
export const STATIC_PATHS = [
	"/",
	"/about",
	"/brands",
	"/contact",
	"/careers",
	"/faq",
	"/press",
	"/privacy",
	"/returns",
	"/sell",
	"/shipping",
	"/terms",
];
