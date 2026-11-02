import type { Appearance, StripeCardElementOptions, StripeElementsOptions } from "@stripe/stripe-js";

/**
 * Stripe renders inside an iframe, so CSS variables don't reach it. Read the
 * Swatch Book tokens from :root at runtime and hand Stripe literal colours.
 * Fallbacks are the DESIGN.md values, used during SSR.
 */
const FALLBACK = {
	ink: "#171A21", // --nl-cacao
	pencil: "#545963", // --nl-russet (hsl 220 8% 36%)
	stock: "#FFFFFF", // --nl-pearl
	orange: "#F24A0D", // --nl-amber (hsl 16 90% 50%)
	danger: "#C52020", // --destructive (hsl 0 72% 45%)
} as const;

function hslToHex(h: number, s: number, l: number): string {
	const sat = s / 100;
	const light = l / 100;
	const a = sat * Math.min(light, 1 - light);
	const f = (n: number) => {
		const k = (n + h / 30) % 12;
		const c = light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
		return Math.round(c * 255)
			.toString(16)
			.padStart(2, "0");
	};
	return `#${f(0)}${f(8)}${f(4)}`.toUpperCase();
}

/** Parse a shadcn-style token value ("222 18% 11%") into hex. */
export function tokenHex(raw: string | null | undefined, fallback: string): string {
	const m = raw?.trim().match(/^(-?[\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%$/);
	if (!m) return fallback;
	return hslToHex(Number(m[1]), Number(m[2]), Number(m[3]));
}

export function readSwatchColors() {
	if (typeof window === "undefined") return { ...FALLBACK };
	const css = getComputedStyle(document.documentElement);
	const read = (name: string, fallback: string) => tokenHex(css.getPropertyValue(name), fallback);
	return {
		ink: read("--nl-cacao", FALLBACK.ink),
		pencil: read("--nl-russet", FALLBACK.pencil),
		stock: read("--nl-pearl", FALLBACK.stock),
		orange: read("--nl-amber", FALLBACK.orange),
		danger: read("--destructive", FALLBACK.danger),
	};
}

const FONT_STACK = "Geist, 'Readex Pro', system-ui, sans-serif";

/** Web fonts Stripe should load inside its iframes. */
export const STRIPE_FONTS: StripeElementsOptions["fonts"] = [
	{ cssSrc: "https://fonts.googleapis.com/css2?family=Geist:wght@400;500&family=Readex+Pro:wght@400;500&display=swap" },
];

/** Appearance for Elements-API surfaces (Express Checkout). */
export function swatchAppearance(): Appearance {
	const c = readSwatchColors();
	return {
		theme: "stripe",
		variables: {
			colorPrimary: c.ink,
			colorBackground: c.stock,
			colorText: c.ink,
			colorTextSecondary: c.pencil,
			colorDanger: c.danger,
			fontFamily: FONT_STACK,
			fontSizeBase: "15px",
			borderRadius: "6px",
			spacingUnit: "4px",
		},
	};
}

/** Style for the classic CardElement, which takes `style` rather than `appearance`. */
export function swatchCardStyle(): StripeCardElementOptions["style"] {
	const c = readSwatchColors();
	return {
		base: {
			color: c.ink,
			fontFamily: FONT_STACK,
			fontSize: "16px",
			fontSmoothing: "antialiased",
			iconColor: c.pencil,
			"::placeholder": { color: c.pencil },
		},
		invalid: { color: c.danger, iconColor: c.danger },
	};
}
