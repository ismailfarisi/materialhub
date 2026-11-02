import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SortToolbar } from "../sort-toolbar";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
	useRouter: () => ({ replace }),
	useSearchParams: () => new URLSearchParams("page=3"),
}));
vi.mock("next-intl", () => ({
	useLocale: () => "en",
	useTranslations: () => (key: string) => key,
}));

describe("SortToolbar", () => {
	it("renders the count in mono on all viewports", () => {
		render(<SortToolbar totalResults={1284} />);
		expect(screen.getByText("1,284")).toHaveClass("font-mono");
		expect(screen.getByText("resultsLabel")).toBeInTheDocument();
	});

	it("hides sort on mobile via lg:flex utilities", () => {
		render(<SortToolbar totalResults={42} />);
		const controls = screen.getByTestId("sort-controls");
		expect(controls.className).toMatch(/hidden/);
		expect(controls.className).toMatch(/lg:flex/);
	});

	it("changing the sort resets to page one", () => {
		replace.mockClear();
		render(<SortToolbar totalResults={42} />);
		fireEvent.change(screen.getByLabelText("sort"), { target: { value: "price_asc" } });
		expect(replace).toHaveBeenCalledWith("?sort=price_asc", { scroll: false });
	});
});
