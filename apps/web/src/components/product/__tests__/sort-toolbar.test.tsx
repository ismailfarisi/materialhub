import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SortToolbar } from "../sort-toolbar";

vi.mock("next/navigation", () => ({
	useRouter: () => ({ replace: vi.fn() }),
	useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("next-intl", () => ({
	useTranslations: () => (key: string) => key,
}));

describe("SortToolbar", () => {
	it("renders the count on all viewports", () => {
		render(<SortToolbar totalResults={42} />);
		expect(screen.getByText(/results/)).toBeInTheDocument();
	});

	it("hides sort and view toggle on mobile via lg:flex utilities", () => {
		render(<SortToolbar totalResults={42} />);
		const controls = screen.getByTestId("sort-controls");
		expect(controls.className).toMatch(/hidden/);
		expect(controls.className).toMatch(/lg:flex/);
	});
});
