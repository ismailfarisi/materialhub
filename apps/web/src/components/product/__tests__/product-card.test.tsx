import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProductCard } from "../product-card";

vi.mock("next-intl", () => ({
	useLocale: () => "en",
	useTranslations: () => (key: string) => key,
}));

vi.mock("next/image", () => ({
	default: ({
		fill: _fill,
		...props
	}: React.ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean }) => (
		<img {...props} src={props.src as string} alt={props.alt as string} />
	),
}));

vi.mock("next/link", () => ({
	default: ({
		children,
		href,
	}: {
		children: React.ReactNode;
		href: string;
	}) => <a href={href}>{children}</a>,
}));

vi.mock("next/navigation", () => ({
	useRouter: () => ({ push: vi.fn() }),
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

const mockProduct = {
	id: "1",
	name: "Test Product",
	slug: "test-product",
	price_min: 5000,
	price_max: 5000,
	compare_at_price: 7500,
	images: ["https://cdn.example.com/img.webp"],
	rating_avg: 4.5,
	vendor_name: "Test Vendor",
	brand_name: "Test Brand",
};

describe("ProductCard", () => {
	it("renders product name and price", () => {
		render(<ProductCard product={mockProduct} />);
		expect(screen.getByText("Test Product")).toBeInTheDocument();
		expect(screen.getByText("50")).toBeInTheDocument();
	});

	it("shows strikethrough compare_at_price when higher than price", () => {
		render(<ProductCard product={mockProduct} />);
		expect(screen.getByText("75")).toBeInTheDocument();
	});

	it("links to product detail page", () => {
		render(<ProductCard product={mockProduct} />);
		const link = screen.getByRole("link");
		expect(link).toHaveAttribute("href", "/en/product/test-product");
	});

	it("renders brand name as the eyebrow", () => {
		render(<ProductCard product={mockProduct} />);
		expect(screen.getByText("Test Brand")).toBeInTheDocument();
	});

	it("requests a sharp enough image for the responsive card grid", () => {
		render(<ProductCard product={mockProduct} />);
		const image = screen.getByRole("img", { name: "Test Product" });
		expect(image).toHaveAttribute(
			"sizes",
			"(max-width: 640px) 50vw, (max-width: 1024px) 33vw, (max-width: 1536px) 25vw, 360px",
		);
		expect(image).toHaveAttribute("quality", "92");
	});
});
