import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProductGrid } from "../product-grid";

vi.mock("../product-card", () => ({
	// biome-ignore lint/suspicious/noExplicitAny: test mock
	ProductCard: ({ product }: any) => <div data-testid="card">{product.id}</div>,
}));

describe("ProductGrid", () => {
	it("uses grid-cols-2 by default", () => {
		render(<ProductGrid products={[{ id: "1" }, { id: "2" }]} />);
		const wrapper = screen.getAllByTestId("card")[0].parentElement;
		expect(wrapper?.className).toMatch(/grid-cols-2/);
		expect(wrapper?.className).not.toMatch(/grid-cols-1/);
	});

	it("uses list layout when view='list'", () => {
		render(<ProductGrid products={[{ id: "1" }]} view="list" />);
		const wrapper = screen.getByTestId("card").parentElement;
		expect(wrapper?.className).not.toMatch(/grid-cols/);
	});
});
