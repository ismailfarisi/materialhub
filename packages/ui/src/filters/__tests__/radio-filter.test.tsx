import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RadioFilter } from "../radio-filter.tsx";

const filter = {
	key: "gender",
	name: "Gender",
	filter_input_type: "radio" as const,
	values: [
		{ value: "women", label: "Women" },
		{ value: "men", label: "Men" },
		{ value: "unisex", label: "Unisex" },
	],
};

describe("RadioFilter", () => {
	it("marks the paramValue as checked", () => {
		render(
			<RadioFilter filter={filter} paramValue="women" onChange={vi.fn()} />,
		);
		expect(screen.getByLabelText("Women")).toBeChecked();
		expect(screen.getByLabelText("Men")).not.toBeChecked();
	});

	it("selecting a different option replaces the param", () => {
		const onChange = vi.fn();
		render(
			<RadioFilter filter={filter} paramValue="women" onChange={onChange} />,
		);
		fireEvent.click(screen.getByLabelText("Men"));
		expect(onChange).toHaveBeenCalledWith("men");
	});

	it("clicking the currently-selected option clears the param", () => {
		const onChange = vi.fn();
		render(
			<RadioFilter filter={filter} paramValue="women" onChange={onChange} />,
		);
		fireEvent.click(screen.getByLabelText("Women"));
		expect(onChange).toHaveBeenCalledWith(null);
	});
});
