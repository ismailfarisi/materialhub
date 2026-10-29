import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CheckboxFilter } from "../checkbox-filter.tsx";

const filter = {
	key: "size",
	name: "Size",
	filter_input_type: "checkbox" as const,
	values: [
		{ value: "s", label: "S" },
		{ value: "m", label: "M" },
		{ value: "l", label: "L" },
	],
};

describe("CheckboxFilter", () => {
	it("renders all values with checked state from paramValue", () => {
		render(
			<CheckboxFilter filter={filter} paramValue="s,m" onChange={vi.fn()} />,
		);
		expect(screen.getByLabelText("S")).toBeChecked();
		expect(screen.getByLabelText("M")).toBeChecked();
		expect(screen.getByLabelText("L")).not.toBeChecked();
	});

	it("toggling an unchecked box adds it to the comma list", () => {
		const onChange = vi.fn();
		render(
			<CheckboxFilter filter={filter} paramValue="s" onChange={onChange} />,
		);
		fireEvent.click(screen.getByLabelText("M"));
		expect(onChange).toHaveBeenCalledWith("s,m");
	});

	it("toggling the last checked box clears the param", () => {
		const onChange = vi.fn();
		render(
			<CheckboxFilter filter={filter} paramValue="s" onChange={onChange} />,
		);
		fireEvent.click(screen.getByLabelText("S"));
		expect(onChange).toHaveBeenCalledWith(null);
	});
});
