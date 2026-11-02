import type { SVGProps } from "react";

/**
 * MaterialHub mark + wordmark.
 *
 * The mark is three stacked sheets, offset like a fanned swatch book: the
 * catalogue in one glyph. The top sheet carries the kraft-orange signal
 * colour; the rest inherit `currentColor`, so the logo works on paper (ink)
 * and on carbon (pearl) without a second asset.
 */
export function LogoMark(props: SVGProps<SVGSVGElement>) {
	return (
		<svg viewBox="0 0 32 32" fill="none" aria-hidden="true" {...props}>
			<rect x="3" y="11" width="18" height="18" rx="4" fill="currentColor" opacity="0.28" />
			<rect x="8" y="7" width="18" height="18" rx="4" fill="currentColor" opacity="0.6" />
			<rect x="13" y="3" width="16" height="16" rx="4" fill="hsl(var(--nl-amber))" />
		</svg>
	);
}

export function Logo({
	className = "",
	compact = false,
}: {
	className?: string;
	/** Hide the wordmark below `sm`, leaving just the mark. */
	compact?: boolean;
}) {
	return (
		<span className={`inline-flex items-center gap-2 ${className}`} dir="ltr">
			<LogoMark className="h-7 w-7 shrink-0 md:h-8 md:w-8" />
			<span
				className={`font-display text-[19px] md:text-[21px] font-semibold tracking-[-0.03em] leading-none ${
					compact ? "hidden sm:inline" : ""
				}`}
			>
				Material<span className="font-normal opacity-60">Hub</span>
			</span>
		</span>
	);
}
