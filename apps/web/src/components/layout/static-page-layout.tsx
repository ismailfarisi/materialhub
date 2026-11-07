import { StaticContents } from "@/components/content/static-contents";
import { MillLabel, type Spec } from "@/components/swatch";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import type { ReactNode } from "react";

export interface ContentsItem {
	id: string;
	label: string;
}

/** Stable anchor id for a section heading ("3. Orders & pricing" → "orders-pricing"). */
export function sectionId(heading: string): string {
	return (
		heading
			.toLowerCase()
			.replace(/^\d+\.\s*/, "")
			.replace(/&/g, " ")
			.replace(/[^\p{L}\p{N}]+/gu, "-")
			.replace(/^-+|-+$/g, "") || "section"
	);
}

/** Build a contents list from section headings, using the same ids as `StaticSection`. */
export function contentsFrom(headings: string[]): ContentsItem[] {
	return headings.map((h) => ({ id: sectionId(h), label: h }));
}

/**
 * Typographic defaults for the reading column: body at a 65–75ch measure,
 * ink text, square list markers, underlined links that turn orange on hover.
 * Nested blocks that opt out (tables, accordions, grids) use `not-prose`.
 */
export const readingProse = cn(
	"text-[15px] md:text-base leading-[1.65] text-nl-cacao",
	"[&_p]:max-w-[70ch] [&_p+p]:mt-4",
	"[&_ul:not(.not-prose)]:max-w-[68ch] [&_ul:not(.not-prose)]:grid [&_ul:not(.not-prose)]:gap-2.5 [&_ul:not(.not-prose)]:ps-5 [&_ul:not(.not-prose)]:list-[square] [&_ul:not(.not-prose)]:marker:text-nl-russet",
	"[&_ol:not(.not-prose)]:max-w-[68ch] [&_ol:not(.not-prose)]:grid [&_ol:not(.not-prose)]:gap-2.5 [&_ol:not(.not-prose)]:ps-6 [&_ol:not(.not-prose)]:list-decimal [&_ol:not(.not-prose)]:marker:font-mono [&_ol:not(.not-prose)]:marker:text-[13px] [&_ol:not(.not-prose)]:marker:text-nl-russet",
	"[&_p+ul]:mt-4 [&_ul+p]:mt-4 [&_p+ol]:mt-4 [&_ol+p]:mt-4",
	"[&_strong]:font-semibold",
	"[&_a]:underline [&_a]:decoration-nl-cacao/30 [&_a]:underline-offset-[0.2em] [&_a:hover]:decoration-nl-amber [&_a]:transition-colors",
);

const RTL_LANGS = new Set(["ar", "ur"]);

interface StaticPageLayoutProps {
	/** Where this page sits, shown as the second breadcrumb (e.g. "Help", "Legal"). */
	eyebrow?: string;
	title: string;
	intro?: ReactNode;
	/** Document facts printed as a mill label in the title band (real facts only). */
	label?: Spec[];
	/** In-page contents; renders a sticky list at lg and a collapsible list below. */
	contents?: ContentsItem[];
	/**
	 * Language the page copy is written in, when it isn't translated. In
	 * another locale the copy is marked with this language and set left to
	 * right (or right to left for Arabic and Urdu copy), so Arabic pages don't
	 * reorder English punctuation.
	 */
	contentLang?: string;
	children: ReactNode;
}

export async function StaticPageLayout({
	eyebrow,
	title,
	intro,
	label,
	contents,
	contentLang,
	children,
}: StaticPageLayoutProps) {
	const locale = await getLocale();
	const foreign: { lang?: string; dir?: "ltr" | "rtl" } =
		contentLang && contentLang !== locale
			? { lang: contentLang, dir: RTL_LANGS.has(contentLang) ? "rtl" : "ltr" }
			: {};
	const t = await getTranslations("content.layout");
	const hasContents = !!contents && contents.length > 1;

	return (
		<div className="bg-nl-linen text-nl-cacao">
			<header className="bg-nl-pearl border-b border-nl-cacao/12">
				<div className="max-w-[1400px] mx-auto px-4 md:px-8 pt-5 pb-10 md:pt-7 md:pb-14">
					<nav aria-label={t("breadcrumb")}>
						<ol className="flex flex-wrap items-center gap-1.5 text-[13px] text-nl-russet list-none m-0 p-0">
							<li>
								<Link
									href={`/${locale}`}
									className="underline decoration-transparent underline-offset-[0.2em] hover:decoration-nl-cacao/40 hover:text-nl-cacao"
								>
									{t("home")}
								</Link>
							</li>
							{eyebrow && (
								<>
									<li aria-hidden="true">
										<ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" strokeWidth={1.75} />
									</li>
									<li aria-current="page" className="text-nl-cacao" {...foreign}>
										{eyebrow}
									</li>
								</>
							)}
						</ol>
					</nav>
					<div
						className={cn(
							"mt-8 md:mt-12 grid gap-8",
							label && label.length > 0 && "lg:grid-cols-[minmax(0,1fr)_340px] lg:items-end lg:gap-16",
						)}
					>
						<div className="grid gap-4 md:gap-5 min-w-0" {...foreign}>
							<h1 className="font-display font-bold font-expanded text-[clamp(32px,5vw,64px)] leading-[1.02] tracking-[-0.03em] m-0 max-w-[20ch]">
								{title}
							</h1>
							{intro && (
								<p className="text-[16px] md:text-[18px] leading-[1.55] text-nl-russet max-w-[60ch] m-0">
									{intro}
								</p>
							)}
						</div>
						{label && label.length > 0 && (
							<aside aria-label={t("documentDetails")} {...foreign}>
								<MillLabel specs={label} />
							</aside>
						)}
					</div>
				</div>
			</header>

			<div
				className={cn(
					"max-w-[1400px] mx-auto px-4 md:px-8 py-10 md:py-16",
					hasContents && "lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-16 xl:gap-24",
				)}
			>
				{hasContents && <StaticContents items={contents} title={t("onThisPage")} itemsLang={foreign.lang} />}
				<div
					{...foreign}
					className={cn("min-w-0 grid gap-12 md:gap-16 content-start", !hasContents && "max-w-[1100px]")}
				>
					{children}
				</div>
			</div>
		</div>
	);
}

interface StaticSectionProps {
	heading?: string;
	/** Anchor id; defaults to `sectionId(heading)`. */
	id?: string;
	children: ReactNode;
	className?: string;
}

export function StaticSection({ heading, id, children, className }: StaticSectionProps) {
	const anchor = id ?? (heading ? sectionId(heading) : undefined);
	return (
		<section id={anchor} aria-labelledby={heading && anchor ? `${anchor}-h` : undefined} className={cn("scroll-mt-28", className)}>
			{heading && (
				<h2
					id={anchor ? `${anchor}-h` : undefined}
					className="font-display font-semibold text-[clamp(22px,2.4vw,28px)] leading-[1.12] tracking-[-0.02em] text-nl-cacao m-0 mb-4 md:mb-5 max-w-[32ch]"
				>
					{heading}
				</h2>
			)}
			<div className={readingProse}>{children}</div>
		</section>
	);
}
