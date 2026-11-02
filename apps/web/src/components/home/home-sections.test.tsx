import { render, screen, within } from "@testing-library/react";
import type React from "react";
import { describe, expect, test, vi } from "vitest";
import { LayoutRenderer } from "../layout/layout-renderer";
import { CategoryStocks } from "./category-stocks";
import { stockMix } from "./collection-header";
import { NEUTRAL_STOCK, matchStock } from "./stock-match";

vi.mock("next-intl/server", () => ({
	getLocale: async () => "en",
	getTranslations: async () => (key: string) => key,
}));
vi.mock("next-intl", () => ({
	useLocale: () => "en",
	useTranslations: () => (k: string) => k,
}));
// Section adapters are async server components; this suite tests placement only.
vi.mock("./section-boundary", () => ({ SectionBoundary: () => null }));

globalThis.ResizeObserver ??= class {
	observe() {}
	unobserve() {}
	disconnect() {}
} as unknown as typeof ResizeObserver;

vi.mock("next/link", () => ({
	default: ({
		href,
		children,
		...props
	}: { href: string; children: React.ReactNode }) => (
		<a href={href} {...props}>
			{children}
		</a>
	),
}));

describe("matchStock", () => {
	test("resolves real category signals", () => {
		expect(matchStock("papers-boards")?.key).toBe("paper");
		expect(matchStock("Greyboard & Chipboard")?.key).toBe("paper");
		expect(matchStock("Mailer Boxes")?.key).toBe("packaging");
		expect(matchStock(null, "PU Leather")?.key).toBe("leather");
	});

	test("returns null instead of defaulting to paper blue", () => {
		expect(matchStock("Studio Twelve Trading")).toBeNull();
		expect(matchStock(undefined, "")).toBeNull();
		expect(NEUTRAL_STOCK.color).toContain("--nl-cacao");
	});
});

describe("stockMix", () => {
	test("counts items per stock in stock order and skips unknowns", () => {
		expect(
			stockMix([
				{ category_name: "Mailer Boxes" },
				{ category_name: "Art Papers" },
				{ category_name: "Kraft Papers" },
				{ category_name: "Mystery" },
			]),
		).toEqual([
			{ key: "paper", count: 2 },
			{ key: "packaging", count: 1 },
		]);
	});
});

describe("CategoryStocks", () => {
	test("renders the seven stocks as blades linking to their categories", async () => {
		render(await CategoryStocks({ locale: "en" }));
		const links = screen
			.getAllByRole("link")
			.filter((a) => a.getAttribute("data-stock"));
		expect(links.map((a) => a.getAttribute("href"))).toEqual([
			"/en/c/papers-boards",
			"/en/c/leather-fabrics",
			"/en/c/hardware-fittings",
			"/en/c/adhesives-finishing",
			"/en/c/boxes-packaging",
			"/en/c/ribbons-trims",
			"/en/c/decoration-craft",
		]);
	});
});

describe("LayoutRenderer afterHero", () => {
	const section = (id: string, type: string) => ({
		id,
		type,
		position: 0,
		settings: {},
		source_mode: "manual",
		data: {},
	});

	test("places the slot straight after the hero", () => {
		const { container } = render(
			<LayoutRenderer
				sections={[
					section("a", "hero_carousel"),
					section("b", "newsletter_signup"),
				]}
				afterHero={<div data-testid="slot" />}
			/>,
		);
		const order = Array.from(container.firstElementChild?.children ?? []).map(
			(el) =>
				el.getAttribute("data-section-type") ?? el.getAttribute("data-testid"),
		);
		expect(order).toEqual(["hero_carousel", "slot", "newsletter_signup"]);
	});

	test("places the slot first when there is no hero, and skips unknown types", () => {
		const { container } = render(
			<LayoutRenderer
				sections={[section("x", "reels"), section("b", "newsletter_signup")]}
				afterHero={<div data-testid="slot" />}
			/>,
		);
		const root = container.firstElementChild as HTMLElement;
		expect(root.children[0].getAttribute("data-testid")).toBe("slot");
		expect(within(root).queryByText("reels")).toBeNull();
		expect(root.children).toHaveLength(2);
	});
});
