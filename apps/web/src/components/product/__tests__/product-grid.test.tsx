import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProductGrid } from "../product-grid";

vi.mock("../product-card", () => ({
	// biome-ignore lint/suspicious/noExplicitAny: test mock
	ProductCard: ({ product }: any) => <div data-testid="card">{product.id}</div>,
}));

describe("ProductGrid", () => {
	it("is 2 columns on mobile, 3 at md, 4 at xl", () => {
		render(<ProductGrid products={[{ id: "1" }, { id: "2" }]} />);
		const grid = screen.getByRole("list");
		expect(grid.className).toMatch(/grid-cols-2/);
		expect(grid.className).toMatch(/md:grid-cols-3/);
		expect(grid.className).toMatch(/xl:grid-cols-4/);
		expect(grid.className).not.toMatch(/2xl:grid-cols-5/);
		expect(screen.getAllByTestId("card")).toHaveLength(2);
	});

	it("adds a fifth column at 2xl when wide (search)", () => {
		render(<ProductGrid products={[{ id: "1" }]} wide />);
		expect(screen.getByRole("list").className).toMatch(/2xl:grid-cols-5/);
	});
});
