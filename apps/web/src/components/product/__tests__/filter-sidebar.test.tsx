import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FilterSidebar } from "../filter-sidebar";

const replace = vi.fn();
// A STABLE instance is required here, unlike the sibling filter-* tests.
// FilterSidebar has `useEffect(..., [searchParams, isPending])` which calls
// setDraft; returning `new URLSearchParams()` per call gives a fresh identity
// every render, so the effect re-fires forever — an infinite render loop that
// exhausts memory and crashes the vitest worker (which then wedges the whole
// `vitest run` for apps/web). Real `useSearchParams()` returns a stable
// reference, so this only ever bit the test, never production.
const searchParams = new URLSearchParams("");
vi.mock("@/components/delivery/delivery-filter-group", () => ({
	DeliveryFilterGroup: () => null,
}));
vi.mock("next/navigation", () => ({
	useRouter: () => ({ replace }),
	useSearchParams: () => searchParams,
}));
vi.mock("next-intl", () => ({
	useTranslations: () => (key: string) => key,
}));
vi.mock("@materialhub/ui", async () => {
	// biome-ignore lint/suspicious/noExplicitAny: test mock
	const actual = await vi.importActual<any>("@materialhub/ui");
	return {
		...actual,
		AttributeFilterSidebar: () => <div data-testid="attr-stub" />,
	};
});

const facets = {
	brands: [{ value: "gulf-board", label: "Gulf Board" }],
	vendors: [],
	attributes: [],
	priceRange: { min: 0, max: 100000 },
};

describe("FilterSidebar (refactored)", () => {
	it("commits brand toggle to the URL eagerly", () => {
		replace.mockClear();
		render(<FilterSidebar config={facets} />);
		fireEvent.click(screen.getByLabelText("Gulf Board"));
		expect(replace).toHaveBeenCalledWith(
			expect.stringContaining("brand=gulf-board"),
			{ scroll: false },
		);
	});

	it("hides Clear all until a filter is set, then resets to ?", () => {
		const { unmount } = render(<FilterSidebar config={facets} />);
		expect(screen.queryByText("clearAll")).not.toBeInTheDocument();
		unmount();

		// The rail mirrors the URL, so the filter has to be in it.
		searchParams.set("brand", "gulf-board");
		try {
			render(<FilterSidebar config={facets} />);
			replace.mockClear();
			fireEvent.click(screen.getByText("clearAll"));
			expect(replace).toHaveBeenCalledWith("?", { scroll: false });
		} finally {
			searchParams.delete("brand");
		}
	});

	it("renders an aside with role=complementary and the filters label", () => {
		render(<FilterSidebar config={facets} />);
		expect(
			screen.getByRole("complementary", { name: /filters/i }),
		).toBeInTheDocument();
	});
});
