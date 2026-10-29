import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AttributeFilterSidebar } from "../attribute-filter-sidebar.tsx";

const attributes = [
	{
		key: "color",
		name: "Color",
		filter_input_type: "color_swatch" as const,
		values: [{ value: "red", label: "Red", color_hex: "#FF0000" }],
	},
	{
		key: "size",
		name: "Size",
		filter_input_type: "checkbox" as const,
		values: [
			{ value: "s", label: "S" },
			{ value: "m", label: "M" },
		],
	},
	{
		key: "weight",
		name: "Weight",
		filter_input_type: "range" as const,
		values: [],
	},
	{
		key: "mystery",
		name: "Mystery",
		filter_input_type: null,
		values: [{ value: "x", label: "X" }],
	},
];

describe("AttributeFilterSidebar", () => {
	it("dispatches to correct renderer per filter_input_type", () => {
		render(
			<AttributeFilterSidebar
				attributes={attributes}
				getParam={() => null}
				onChangeParam={vi.fn()}
			/>,
		);
		expect(screen.getByRole("button", { name: "Red" })).toBeInTheDocument(); // color swatch
		expect(screen.getByLabelText("S")).toBeInTheDocument(); // checkbox
		expect(screen.getByLabelText(/weight min/i)).toBeInTheDocument(); // range
	});

	it("silently skips filters with null filter_input_type", () => {
		render(
			<AttributeFilterSidebar
				attributes={attributes}
				getParam={() => null}
				onChangeParam={vi.fn()}
			/>,
		);
		expect(screen.queryByText("Mystery")).not.toBeInTheDocument();
	});
});
