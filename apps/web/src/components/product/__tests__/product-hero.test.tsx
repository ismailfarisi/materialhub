import { fireEvent, render, screen, within } from "@testing-library/react";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProductHero } from "../product-hero";

vi.mock("@/components/delivery/delivery-promise", () => ({ DeliveryPromise: () => null }));
vi.mock("next-intl", () => ({
	useLocale: () => "en",
	useTranslations: () => {
		const t = (key: string, values?: Record<string, unknown>) =>
			values ? `${key}:${Object.values(values).join(",")}` : key;
		t.rich = (key: string) => key;
		return t;
	},
}));

vi.mock("next/image", () => ({
	default: ({ alt, fill, priority, ...props }: { alt: string; fill?: boolean; priority?: boolean }) =>
		createElement("img", { alt, ...props }),
}));

vi.mock("next/link", () => ({
	default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
		<a href={href} {...rest}>
			{children}
		</a>
	),
}));

const mutate = vi.fn();
vi.mock("@/stores/cart", () => ({ useCartStore: () => ({ openSlideOver: vi.fn() }) }));
vi.mock("@/lib/queries/cart", () => ({
	useAddToCart: () => ({ mutate, isPending: false, isError: false }),
}));
vi.mock("@/lib/queries/account", () => ({
	useToggleWishlist: () => ({ mutate: vi.fn(), isPending: false }),
	useWishlist: () => ({ data: [] }),
}));
vi.mock("@/hooks/use-scroll-past", () => ({
	useScrollPast: () => ({ ref: { current: null }, isPast: false }),
}));
vi.mock("../seller-block", () => ({ SellerBlock: () => null }));
vi.mock("../bnpl-strip", () => ({ BnplStrip: () => null }));
vi.mock("@/lib/breadcrumb-jsonld", () => ({ buildBreadcrumbJsonLd: () => ({}) }));

const product = {
	id: "product-1",
	title: "Greyboard 2.0 mm",
	price: 480,
	in_stock: true,
	quantity_available: 40,
	rating_avg: 0,
	review_count: 0,
	sku: "GB-2000",
	country_of_origin: "Netherlands",
	attributes: { unit: "Sheet" },
	attributeValues: [
		{
			attribute: { slug: "grammage", name: "Grammage", sort_order: 1 },
			attributeValue: { value: "1250 gsm" },
			is_visible: true,
			variant_id: null,
		},
		{
			attribute: { slug: "finish", name: "Finish", sort_order: 2 },
			attributeValue: { value: "Uncoated" },
			is_visible: true,
			variant_id: null,
		},
		{
			attribute: { slug: "internal", name: "Internal note", sort_order: 3 },
			text_value: "hidden",
			is_visible: false,
			variant_id: null,
		},
	],
	images: [
		{ id: "image-1", url: "https://cdn.example.com/greyboard-front.webp", alt_text: "Greyboard stack" },
		{ id: "image-2", url: "https://cdn.example.com/greyboard-edge.webp", alt_text: "Greyboard edge" },
	],
};

describe("ProductHero", () => {
	beforeEach(() => mutate.mockReset());

	it("renders each product photo once in the main well (thumbnails are decorative)", () => {
		render(<ProductHero product={product} vendor={null} />);
		expect(screen.getAllByAltText("Greyboard stack")).toHaveLength(1);
		expect(screen.getAllByAltText("Greyboard edge")).toHaveLength(1);
		expect(screen.getByRole("button", { name: "showImage:2" })).toBeTruthy();
	});

	it("shows the price with its unit and a full mill-label spec table", () => {
		render(<ProductHero product={product} vendor={null} />);
		expect(screen.getByText("/ sheet")).toBeTruthy();
		const spec = screen.getByRole("heading", { name: "specification" }).parentElement as HTMLElement;
		expect(within(spec).getByText("Grammage")).toBeTruthy();
		expect(within(spec).getByText("1250 gsm")).toBeTruthy();
		expect(within(spec).getByText("Uncoated")).toBeTruthy();
		expect(within(spec).getByText("Netherlands")).toBeTruthy();
		expect(within(spec).getByText("GB-2000")).toBeTruthy();
		expect(within(spec).queryByText("Internal note")).toBeNull();
	});

	it("uses marketplace policy defaults in the perk list", () => {
		render(<ProductHero product={product} vendor={null} />);
		expect(screen.getByText("freeShipping:AED 150")).toBeTruthy();
		expect(screen.getByText("returns:7")).toBeTruthy();
	});

	it("adds the chosen quantity to the cart from the signal button", () => {
		render(<ProductHero product={product} vendor={null} />);
		fireEvent.click(screen.getByRole("button", { name: "increase" }));
		const btn = screen.getByRole("button", { name: /addToCart/ }) as HTMLButtonElement;
		expect(btn.disabled).toBe(false);
		expect(btn.className).toContain("bg-nl-amber");
		fireEvent.click(btn);
		expect(mutate).toHaveBeenCalledWith(
			{ productId: "product-1", variantId: null, quantity: 2 },
			expect.anything(),
		);
	});

	it("disables the add button and shows Out of stock when the product is out of stock", () => {
		render(<ProductHero product={{ ...product, in_stock: false, quantity_available: 0 }} vendor={null} />);
		expect(screen.queryByRole("button", { name: /addToCart/ })).toBeNull();
		const btn = screen.getAllByRole("button", { name: "outOfStock" })[0] as HTMLButtonElement;
		expect(btn.disabled).toBe(true);
		expect(screen.getByText("productOutOfStock")).toBeTruthy();
	});

	it("renders variant options as chips, preselects an in-stock variant and swaps the price", () => {
		const variantProduct = {
			...product,
			variants: [
				{ id: "v-a", price: 480, sku: "GB-70100", option_values: { size: "70 × 100 cm" } },
				{ id: "v-b", price: 260, sku: "GB-5070", option_values: { size: "50 × 70 cm" } },
			],
			inventoryRecords: [
				{ variant_id: "v-a", quantity_available: 0 },
				{ variant_id: "v-b", quantity_available: 7 },
			],
		};
		render(<ProductHero product={variantProduct} vendor={null} />);

		const inStock = screen.getByRole("button", { name: "50 × 70 cm" });
		expect(inStock.getAttribute("aria-pressed")).toBe("true");
		expect(screen.getByText("GB-5070")).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: "70 × 100 cm (soldOut)" }));
		expect(screen.getAllByRole("button", { name: "outOfStock" })[0]).toHaveProperty("disabled", true);
		expect(screen.getByText("optionOutOfStock")).toBeTruthy();
	});

	it("renders colour variants as real colour squares", () => {
		const colourProduct = {
			...product,
			variants: [
				{ id: "v-r", price: 3800, option_values: { colour: "Oxblood" } },
				{ id: "v-k", price: 3800, option_values: { colour: "Black" } },
			],
			inventoryRecords: [
				{ variant_id: "v-r", quantity_available: 3 },
				{ variant_id: "v-k", quantity_available: 3 },
			],
			attributeValues: [
				{ attribute: { slug: "colour", name: "Colour" }, attributeValue: { value: "Oxblood", color_hex: "#7A1F2E" }, variant_id: "v-r" },
				{ attribute: { slug: "colour", name: "Colour" }, attributeValue: { value: "Black", color_hex: "#111111" }, variant_id: "v-k" },
			],
		};
		render(<ProductHero product={colourProduct} vendor={null} />);
		const chip = screen.getByRole("button", { name: "Black" }) as HTMLButtonElement;
		expect(chip.style.backgroundColor).toBe("rgb(17, 17, 17)");
	});
});
