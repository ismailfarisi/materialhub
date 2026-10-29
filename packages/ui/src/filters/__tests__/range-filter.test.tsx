import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RangeFilter } from "../range-filter.tsx";

const filter = {
	key: "weight",
	name: "Weight (g)",
	filter_input_type: "range" as const,
	values: [],
	min: 0,
	max: 1000,
};

describe("RangeFilter", () => {
	it("initialises inputs from paramValue 'min-max'", () => {
		render(
			<RangeFilter filter={filter} paramValue="100-500" onChange={vi.fn()} />,
		);
		expect((screen.getByLabelText(/min/i) as HTMLInputElement).value).toBe(
			"100",
		);
		expect((screen.getByLabelText(/max/i) as HTMLInputElement).value).toBe(
			"500",
		);
	});

	it("applies updated range via 'min-max' param", () => {
		const onChange = vi.fn();
		render(
			<RangeFilter filter={filter} paramValue={null} onChange={onChange} />,
		);
		fireEvent.change(screen.getByLabelText(/min/i), {
			target: { value: "50" },
		});
		fireEvent.change(screen.getByLabelText(/max/i), {
			target: { value: "600" },
		});
		fireEvent.click(screen.getByRole("button", { name: /apply/i }));
		expect(onChange).toHaveBeenCalledWith("50-600");
	});

	it("clearing both inputs clears the param", () => {
		const onChange = vi.fn();
		render(
			<RangeFilter filter={filter} paramValue="100-500" onChange={onChange} />,
		);
		fireEvent.change(screen.getByLabelText(/min/i), { target: { value: "" } });
		fireEvent.change(screen.getByLabelText(/max/i), { target: { value: "" } });
		fireEvent.click(screen.getByRole("button", { name: /apply/i }));
		expect(onChange).toHaveBeenCalledWith(null);
	});

	it("one-sided: '-500' means max only", () => {
		const onChange = vi.fn();
		render(
			<RangeFilter filter={filter} paramValue={null} onChange={onChange} />,
		);
		fireEvent.change(screen.getByLabelText(/max/i), {
			target: { value: "500" },
		});
		fireEvent.click(screen.getByRole("button", { name: /apply/i }));
		expect(onChange).toHaveBeenCalledWith("-500");
	});
});
