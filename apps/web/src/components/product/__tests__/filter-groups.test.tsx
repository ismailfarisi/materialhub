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
		{ value: "gulf-board", label: "Gulf Board", count: 24 },
		{ value: "jebel-papers", label: "Jebel Papers", count: 12 },
	],
	vendors: [{ value: "sharjah-leather", label: "Sharjah Leather House" }],
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
		fireEvent.click(screen.getByLabelText(/Gulf Board/));
		expect(setDraft).toHaveBeenCalledWith({ brand: "gulf-board" });
	});

	it("removes a brand from CSV when toggled off", () => {
		const setDraft = vi.fn();
		render(
			<FilterGroups
				config={facets}
				draft={{ brand: "gulf-board,jebel-papers" }}
				setDraft={setDraft}
				layout="vertical"
			/>,
		);
		fireEvent.click(screen.getByLabelText(/Gulf Board/));
		expect(setDraft).toHaveBeenCalledWith({ brand: "jebel-papers" });
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
		// Price fields are labelled (labels above, not placeholders).
		fireEvent.change(screen.getAllByLabelText("min")[0], {
			target: { value: "50" },
		});
		expect(setDraft).toHaveBeenCalledWith({ minPrice: "50" });
	});

	it("puts spec attributes first, open, with mono values", () => {
		const setDraft = vi.fn();
		render(
			<FilterGroups
				config={{
					...facets,
					attributes: [
						{
							key: "colour",
							name: "Colour",
							filter_input_type: "checkbox",
							values: [{ value: "black", label: "Black" }],
						},
						{
							key: "gsm",
							name: "GSM",
							filter_input_type: "checkbox",
							values: [
								{ value: "300", label: "300 gsm", count: 8 },
								{ value: "350", label: "350 gsm", count: 5 },
							],
						},
					],
				}}
				draft={{}}
				setDraft={setDraft}
				layout="vertical"
			/>,
		);
		const headings = screen
			.getAllByRole("button", { expanded: true })
			.concat(screen.getAllByRole("button", { expanded: false }))
			.map((b) => b.textContent);
		// Spec group is rendered (and open) before price; Colour is collapsed.
		expect(screen.getByText("specification")).toBeInTheDocument();
		expect(screen.getByText("350 gsm")).toHaveClass("font-mono");
		expect(screen.queryByText("Black")).not.toBeInTheDocument();
		expect(headings.some((h) => h?.startsWith("GSM"))).toBe(true);

		fireEvent.click(screen.getByLabelText("350 gsm"));
		expect(setDraft).toHaveBeenCalledWith({ gsm: "350" });
	});

	it("labels the vendor facet as Supplier", () => {
		render(
			<FilterGroups config={facets} draft={{}} setDraft={vi.fn()} layout="vertical" />,
		);
		expect(screen.getByRole("button", { name: /supplier/ })).toBeInTheDocument();
	});
});
