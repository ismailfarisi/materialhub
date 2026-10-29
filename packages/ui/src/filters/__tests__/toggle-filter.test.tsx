import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ToggleFilter } from "../toggle-filter.tsx";

const filter = {
	key: "on_sale",
	name: "On sale",
	filter_input_type: "toggle" as const,
	values: [],
};

describe("ToggleFilter", () => {
	it("renders unpressed when paramValue is null", () => {
		render(
			<ToggleFilter filter={filter} paramValue={null} onChange={vi.fn()} />,
		);
		expect(screen.getByRole("button", { name: /on sale/i })).toHaveAttribute(
			"aria-pressed",
			"false",
		);
	});

	it("renders pressed when paramValue is 'true'", () => {
		render(
			<ToggleFilter filter={filter} paramValue="true" onChange={vi.fn()} />,
		);
		expect(screen.getByRole("button", { name: /on sale/i })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
	});

	it("click toggles on then off", () => {
		const onChange = vi.fn();
		const { rerender } = render(
			<ToggleFilter filter={filter} paramValue={null} onChange={onChange} />,
		);
		fireEvent.click(screen.getByRole("button", { name: /on sale/i }));
		expect(onChange).toHaveBeenLastCalledWith("true");

		rerender(
			<ToggleFilter filter={filter} paramValue="true" onChange={onChange} />,
		);
		fireEvent.click(screen.getByRole("button", { name: /on sale/i }));
		expect(onChange).toHaveBeenLastCalledWith(null);
	});
});
