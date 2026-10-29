// Visual language for the calendar grid (Task 6 — frontend-design pass).
//
// KIND and STATUS are deliberately two orthogonal channels, not one combined
// palette, so a vendor scanning the grid can read "what kind of thing is
// this" and "is this a problem" independently:
//
//  - KIND -> a left accent stripe + icon + soft background tint, using the
//    app's existing brand hues (matches StatusBadge's bg-X/10 text-X
//    border-X/30 idiom already established in Tasks 4-5, not a new palette).
//    marketplace_booking gets amber — the app-wide "confirmed / real revenue"
//    color (StatusBadge: published/confirmed/paid/delivered/completed all
//    read amber) — because a marketplace booking IS the vendor's confirmed
//    revenue. walk_in/phone (front-desk-entered, no online payment) get the
//    warmer caramel/taupe tones already used for "informational, not yet
//    settled" states elsewhere. external_import gets a cool, deliberately
//    OFF-brand slate tone (not one of the 8 Maison hues) so a synced-from-
//    elsewhere row visually reads as "foreign data", distinct from anything
//    the vendor created in this app. manual_block/break get a diagonal-hatch
//    neutral (no color at all) — "this time doesn't belong to anyone",
//    the same convention paper calendars use to gray out unavailable time.
//  - STATUS -> border style + fill opacity, layered ON TOP of the kind
//    treatment: held (tentative, in-checkout) = dashed border + reduced
//    opacity; confirmed = solid border + full opacity (the default); and
//    conflicted OVERRIDES the kind color entirely with the app's existing
//    danger hue (russet — already means cancelled/rejected/failed/disputed
//    everywhere else in this dashboard, per status-badge.tsx's
//    DEFAULT_COLOR_MAP) plus an alert-triangle corner badge, so a conflict
//    reads as urgent regardless of what kind of engagement it collided with.

export type EngagementKind =
	| "marketplace_booking"
	| "walk_in"
	| "phone"
	| "external_import"
	| "manual_block"
	| "break";

export type EngagementStatus = "held" | "confirmed" | "conflicted";

export interface KindStyle {
	label: string;
	/** Left accent stripe color (literal class — see Tailwind-JIT note below). */
	stripeClass: string;
	/** Legend swatch background (literal class). */
	swatchClass: string;
	/** Block background fill (confirmed state, literal class). */
	fillClass: string;
	/** Text color class. */
	textClass: string;
}

// Every class below is spelled out as a full literal string (never built by
// string concatenation at runtime) — Tailwind's JIT scanner statically greps
// source text for class names; a `"bg-" + hue` runtime template would never
// be found by that scan and the utility would silently not exist in the
// built CSS (same class of bug documented in project memory re: content
// globs — this is the same failure mode one level down, at the class-name
// level rather than the content-glob level).
export const KIND_STYLE: Record<EngagementKind, KindStyle> = {
	marketplace_booking: {
		label: "Marketplace booking",
		stripeClass: "border-l-amber",
		swatchClass: "bg-amber",
		fillClass: "bg-amber/12",
		textClass: "text-espresso",
	},
	walk_in: {
		label: "Walk-in",
		stripeClass: "border-l-caramel",
		swatchClass: "bg-caramel",
		fillClass: "bg-caramel/14",
		textClass: "text-espresso",
	},
	phone: {
		label: "Phone booking",
		stripeClass: "border-l-taupe",
		swatchClass: "bg-taupe",
		fillClass: "bg-taupe/16",
		textClass: "text-espresso",
	},
	external_import: {
		label: "Imported (external calendar)",
		stripeClass: "border-l-slate-400",
		swatchClass: "bg-slate-400",
		fillClass: "bg-slate-400/14",
		textClass: "text-slate-700",
	},
	manual_block: {
		label: "Blocked time",
		stripeClass: "border-l-taupe/60",
		swatchClass:
			"bg-[repeating-linear-gradient(135deg,rgba(122,107,90,0.55)_0px,rgba(122,107,90,0.55)_2px,transparent_2px,transparent_6px)]",
		fillClass: "bg-[repeating-linear-gradient(135deg,rgba(122,107,90,0.14)_0px,rgba(122,107,90,0.14)_3px,transparent_3px,transparent_9px)] bg-linen",
		textClass: "text-taupe",
	},
	break: {
		label: "Break",
		stripeClass: "border-l-taupe/60",
		swatchClass:
			"bg-[repeating-linear-gradient(135deg,rgba(122,107,90,0.55)_0px,rgba(122,107,90,0.55)_2px,transparent_2px,transparent_6px)]",
		fillClass: "bg-[repeating-linear-gradient(135deg,rgba(122,107,90,0.14)_0px,rgba(122,107,90,0.14)_3px,transparent_3px,transparent_9px)] bg-linen",
		textClass: "text-taupe",
	},
};

export const CONFLICTED_STYLE = {
	stripeClass: "border-l-russet",
	fillClass: "bg-russet/16",
	borderClass: "border-russet",
	textClass: "text-russet",
};

/** Border treatment for the status layer (independent of kind color). */
export function statusBorderClass(status: EngagementStatus): string {
	if (status === "conflicted") return "border-2 border-russet";
	if (status === "held") return "border border-dashed border-taupe/60";
	return "border border-pearl/40";
}

/** Fill opacity for the status layer — held reads visibly tentative. */
export function statusOpacityClass(status: EngagementStatus): string {
	return status === "held" ? "opacity-70" : "opacity-100";
}

export const KIND_ORDER: EngagementKind[] = [
	"marketplace_booking",
	"walk_in",
	"phone",
	"external_import",
	"manual_block",
	"break",
];

export const STATUS_LABEL: Record<EngagementStatus, string> = {
	held: "Held (tentative)",
	confirmed: "Confirmed",
	conflicted: "Conflicted — needs attention",
};

/**
 * Kinds that can even START a drag gesture. Per the addendum, walk-in/phone
 * ARE grabbable so a vendor can "attempt" the move and get an explain toast
 * on drop (server 422s manual-source anyway) — external_import/manual_block/
 * break are "never draggable" (no gesture at all; move = delete+recreate).
 */
export function isDragAttemptable(kind: EngagementKind): boolean {
	return kind === "marketplace_booking" || kind === "walk_in" || kind === "phone";
}
