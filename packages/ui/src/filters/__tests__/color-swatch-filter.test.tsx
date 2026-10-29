import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ColorSwatchFilter } from "../color-swatch-filter.tsx";

const filter = {
	key: "color",
	name: "Color",
	filter_input_type: "color_swatch" as const,
	values: [
		{ value: "red", label: "Red", color_hex: "#FF0000" },
		{ value: "blue", label: "Blue", color_hex: "#0000FF" },
		{ value: "pattern", label: "Floral", swatch_image_url: "/img/floral.png" },
	],
};

describe("ColorSwatchFilter", () => {
	it("renders swatches with accessible labels", () => {
		render(
			<ColorSwatchFilter
				filter={filter}
				paramValue={null}
				onChange={vi.fn()}
			/>,
		);
		expect(screen.getByRole("button", { name: "Red" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Blue" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Floral" })).toBeInTheDocument();
	});

	it("toggles multi-select and calls onChange with comma list", () => {
		const onChange = vi.fn();
		render(
			<ColorSwatchFilter
				filter={filter}
				paramValue="red"
				onChange={onChange}
			/>,
		);
		fireEvent.click(screen.getByRole("button", { name: "Blue" }));
		expect(onChange).toHaveBeenCalledWith("red,blue");
	});
});
