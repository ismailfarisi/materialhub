import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { ProductHero } from "../product-hero";

vi.mock("next-intl", () => ({
	useLocale: () => "en",
	useTranslations: () => (key: string) => key,
}));

vi.mock("next/image", () => ({
	default: ({
		alt,
		fill,
		priority,
		...props
	}: {
		alt: string;
		fill?: boolean;
		priority?: boolean;
	}) => createElement("img", { alt, ...props }),
}));

vi.mock("next/link", () => ({
	default: ({
		children,
		href,
	}: { children: React.ReactNode; href: string }) => (
		<a href={href}>{children}</a>
	),
}));

vi.mock("embla-carousel-react", () => ({
	default: () => [vi.fn(), null],
}));

vi.mock("@/stores/preferences", () => ({
	usePreferencesStore: () => ({ currency: "AED" }),
}));

vi.mock("@/stores/cart", () => ({
	useCartStore: () => ({ openSlideOver: vi.fn() }),
}));

vi.mock("@/lib/queries/cart", () => ({
	useAddToCart: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/lib/queries/account", () => ({
	useToggleWishlist: () => ({ mutate: vi.fn(), isPending: false }),
	useWishlist: () => ({ data: [] }),
}));

vi.mock("../format-selector", () => ({
	FormatSelector: () => null,
}));

vi.mock("../notes-ritual-craft-tabs", () => ({
	NotesRitualCraftTabs: () => null,
}));

vi.mock("../seller-block", () => ({
	SellerBlock: () => null,
}));

vi.mock("../bnpl-strip", () => ({
	BnplStrip: () => null,
}));

const product = {
	id: "product-1",
	title: "Rose Serum",
	price: 12900,
	in_stock: true,
	rating_avg: 0,
	review_count: 0,
	images: [
		{
			id: "image-1",
			url: "https://cdn.example.com/rose-front.webp",
			alt_text: "Rose Serum front",
		},
		{
			id: "image-2",
			url: "https://cdn.example.com/rose-side.webp",
			alt_text: "Rose Serum side",
		},
	],
};

describe("ProductHero", () => {
	it("renders every product image in the hero gallery", () => {
		render(<ProductHero product={product} vendor={null} />);

		expect(screen.getAllByAltText("Rose Serum front")).toHaveLength(2);
		expect(screen.getAllByAltText("Rose Serum side")).toHaveLength(1);
	});

	it("uses marketplace policy defaults in the PDP perk strip", () => {
		render(<ProductHero product={product} vendor={null} />);

		expect(screen.getByText("Free shipping over AED 150.00")).toBeTruthy();
		expect(screen.getByText("Returns within 7 days")).toBeTruthy();
	});

	it("enables Add to bag for an in-stock product", () => {
		render(<ProductHero product={product} vendor={null} />);

		const btn = screen.getByRole("button", {
			name: /add to bag/i,
		}) as HTMLButtonElement;
		expect(btn.disabled).toBe(false);
	});

	it("disables the add button and shows Out of stock when the product is out of stock", () => {
		render(
			<ProductHero
				product={{ ...product, in_stock: false, quantity_available: 0 }}
				vendor={null}
			/>,
		);

		expect(screen.queryByRole("button", { name: /add to bag/i })).toBeNull();
		const btn = screen.getByRole("button", {
			name: /out of stock/i,
		}) as HTMLButtonElement;
		expect(btn.disabled).toBe(true);
	});

	it("disables the add button when the selected variant is out of stock", () => {
		const variantProduct = {
			...product,
			in_stock: true,
			quantity_available: 5,
			variants: [
				{ id: "v-30", price: 12900, option_values: { format: "30 ml" } },
				{ id: "v-50", price: 18900, option_values: { format: "50 ml" } },
			],
			// First variant (auto-selected) is sold out; the second has stock.
			inventoryRecords: [
				{ variant_id: "v-30", quantity_available: 0 },
				{ variant_id: "v-50", quantity_available: 7 },
			],
		};

		render(<ProductHero product={variantProduct} vendor={null} />);

		const btn = screen.getByRole("button", {
			name: /out of stock/i,
		}) as HTMLButtonElement;
		expect(btn.disabled).toBe(true);
	});
});
