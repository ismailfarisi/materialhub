import type { SVGProps } from "react";

/**
 * MaterialHub mark + wordmark.
 *
 * The mark is three swatch blades fanned from one rivet: the catalogue in one
 * glyph. Blade colours come from the category stocks; the label band on the
 * front blade inherits `currentColor`, so the logo works on board (ink) and
 * on binder black (white) without a second asset.
 */
export function LogoMark(props: SVGProps<SVGSVGElement>) {
	return (
		<svg viewBox="0 0 32 32" fill="none" aria-hidden="true" {...props}>
			<g transform="rotate(-14 16 29)">
				<rect x="10" y="3" width="12" height="25" rx="2" fill="hsl(var(--stock-paper))" />
			</g>
			<g transform="rotate(0 16 29)">
				<rect x="10" y="3" width="12" height="25" rx="2" fill="hsl(var(--stock-trims))" />
			</g>
			<g transform="rotate(14 16 29)">
				<rect x="10" y="3" width="12" height="25" rx="2" fill="hsl(var(--nl-amber))" />
				<rect x="10" y="20" width="12" height="8" rx="2" fill="currentColor" />
			</g>
			<circle cx="16" cy="25.5" r="1.6" fill="hsl(var(--nl-linen))" />
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
				className={`font-display text-[19px] md:text-[21px] font-bold tracking-[-0.02em] [font-stretch:88%] leading-none ${
					compact ? "hidden sm:inline" : ""
				}`}
			>
				Material<span className="font-normal opacity-60">Hub</span>
			</span>
		</span>
	);
}
