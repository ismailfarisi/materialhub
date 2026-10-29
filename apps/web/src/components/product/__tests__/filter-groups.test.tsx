import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FilterGroups } from "../filter-groups";

vi.mock("next-intl", () => ({
	useTranslations: () => (key: string) => key,
}));

vi.mock("@materialhub/ui", async () => {
	// biome-ignore lint/suspicious/noExplicitAny: test mock
	const actual = await vi.importActual<any>("@materialhub/ui");
	return {
		...actual,
		// biome-ignore lint/suspicious/noExplicitAny: test mock
		AttributeFilterSidebar: ({ attributes }: any) => (
			<div data-testid="attr-sidebar">{attributes.length}</div>
		),
	};
});

const facets = {
	brands: [
		{ value: "ouai", label: "Ouai", count: 24 },
		{ value: "sephora", label: "Sephora", count: 12 },
	],
	vendors: [{ value: "v1", label: "Vendor One" }],
	attributes: [],
	priceRange: { min: 0, max: 100000 },
};

describe("FilterGroups", () => {
	it("toggles a brand into the draft on click", () => {
		const setDraft = vi.fn();
		render(
			<FilterGroups
				config={facets}
				draft={{}}
				setDraft={setDraft}
				layout="vertical"
			/>,
		);
		fireEvent.click(screen.getByLabelText(/Ouai/));
		expect(setDraft).toHaveBeenCalledWith({ brand: "ouai" });
	});

	it("removes a brand from CSV when toggled off", () => {
		const setDraft = vi.fn();
		render(
			<FilterGroups
				config={facets}
				draft={{ brand: "ouai,sephora" }}
				setDraft={setDraft}
				layout="vertical"
			/>,
		);
		fireEvent.click(screen.getByLabelText(/Ouai/));
		expect(setDraft).toHaveBeenCalledWith({ brand: "sephora" });
	});

	it("updates includeOutOfStock", () => {
		const setDraft = vi.fn();
		render(
			<FilterGroups
				config={facets}
				draft={{}}
				setDraft={setDraft}
				layout="vertical"
			/>,
		);
		fireEvent.click(screen.getByLabelText("includeOutOfStock"));
		expect(setDraft).toHaveBeenCalledWith({ includeOutOfStock: "true" });
	});

	it("updates minPrice via the input", () => {
		const setDraft = vi.fn();
		render(
			<FilterGroups
				config={facets}
				draft={{}}
				setDraft={setDraft}
				layout="vertical"
			/>,
		);
		fireEvent.change(screen.getByPlaceholderText("Min"), {
			target: { value: "50" },
		});
		expect(setDraft).toHaveBeenCalledWith({ minPrice: "50" });
	});
});
