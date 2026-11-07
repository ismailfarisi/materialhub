import sanitizeHtml from "sanitize-html";

/** A published CMS page as served by the public `GET /pages/:slug`. */
export interface CmsPage {
	id: string;
	title: string;
	slug: string;
	content: string | null;
	locale: string | null;
	meta_title: string | null;
	meta_description: string | null;
	published_at: string | null;
	updated_at?: string | null;
}

/** An active banner as served by the public `GET /banners/active`. */
export interface CmsBanner {
	id: string;
	title: string;
	subtitle: string | null;
	image_url: string;
	mobile_image_url: string | null;
	link_url: string | null;
	placement: string;
	locale: string | null;
}

/** The shape `HeroBanner` renders. */
export interface HeroSlide {
	id: string;
	title: string;
	subtitle?: string;
	cta_label?: string;
	image_url: string;
	mobile_image_url?: string;
	cta_url?: string;
}

/** CMS slugs are lowercase kebab-case (the admin API enforces the same pattern). */
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * The CMS page slug for a catch-all path, or null when the path can't be a
 * CMS page (nested paths, odd characters), so the route 404s without a fetch.
 */
export function cmsSlugFromPath(rest: string[] | undefined): string | null {
	if (!rest || rest.length !== 1) return null;
	const slug = decodeURIComponent(rest[0] ?? "");
	return SLUG_RE.test(slug) && slug.length <= 255 ? slug : null;
}

/**
 * Page bodies are HTML from the admin rich-text editor. Keep the editor's
 * formatting (headings, lists, links, images, tables) and drop everything
 * that can run script or restyle the storefront.
 */
export function sanitizeCmsHtml(html: string | null | undefined): string {
	if (!html) return "";
	return sanitizeHtml(html, {
		allowedTags: [
			"h2", "h3", "h4", "p", "br", "hr", "strong", "b", "em", "i", "u", "s", "mark", "sub", "sup",
			"ul", "ol", "li", "blockquote", "code", "pre", "a", "img", "figure", "figcaption",
			"table", "thead", "tbody", "tr", "th", "td",
		],
		allowedAttributes: {
			a: ["href", "title", "target", "rel"],
			img: ["src", "alt", "title", "width", "height"],
			th: ["colspan", "rowspan"],
			td: ["colspan", "rowspan"],
		},
		// An h1 in the body would compete with the page title.
		transformTags: {
			h1: "h2",
			a: (tagName, attribs) => ({
				tagName,
				attribs:
					attribs.target === "_blank"
						? { ...attribs, rel: "noopener noreferrer" }
						: attribs,
			}),
		},
		allowedSchemes: ["http", "https", "mailto", "tel"],
		allowedSchemesByTag: { img: ["https", "http"] },
		allowProtocolRelative: false,
	});
}

/** Map CMS banners to hero slides; banners without an image are skipped. */
export function bannersToSlides(banners: CmsBanner[] | null | undefined, ctaLabel?: string): HeroSlide[] {
	return (banners ?? [])
		.filter((b) => !!b?.image_url)
		.map((b) => ({
			id: b.id,
			title: b.title,
			subtitle: b.subtitle ?? undefined,
			image_url: b.image_url,
			mobile_image_url: b.mobile_image_url ?? undefined,
			cta_url: b.link_url ?? undefined,
			cta_label: b.link_url ? ctaLabel : undefined,
		}));
}
