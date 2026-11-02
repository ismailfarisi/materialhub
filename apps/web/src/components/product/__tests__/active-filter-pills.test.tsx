import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ActiveFilterPills } from "../active-filter-pills";

vi.mock("next-intl", () => ({
	useTranslations:
		() => (key: string, values?: Record<string, string>) =>
			values?.label ? `${key}:${values.label}` : key,
}));

describe("ActiveFilterPills", () => {
	it("renders nothing when there are no filters", () => {
		const { container } = render(
			<ActiveFilterPills pills={[]} onRemove={() => {}} onClearAll={() => {}} />,
		);
		expect(container).toBeEmptyDOMElement();
	});

	it("renders one chip per filter and calls onRemove on click", () => {
		const onRemove = vi.fn();
		render(
			<ActiveFilterPills
				pills={[
					{ group: "brand", value: "gulf-board", label: "Brand: Gulf Board" },
					{ group: "includeOutOfStock", value: "true", label: "Including out of stock" },
				]}
				onRemove={onRemove}
				onClearAll={() => {}}
			/>,
		);
		expect(screen.getByText("Brand: Gulf Board")).toBeInTheDocument();
		fireEvent.click(screen.getByLabelText("removeFilter:Brand: Gulf Board"));
		expect(onRemove).toHaveBeenCalledWith({ group: "brand", value: "gulf-board" });
	});

	it("shows field and value apart, with measured values in mono, at rounded-sm", () => {
		render(
			<ActiveFilterPills
				pills={[
					{
						group: "gsm",
						value: "350",
						label: "GSM: 350 gsm",
						field: "GSM",
						display: "350 gsm",
						mono: true,
					},
				]}
				onRemove={() => {}}
				onClearAll={() => {}}
			/>,
		);
		expect(screen.getByText("GSM")).toBeInTheDocument();
		expect(screen.getByText("350 gsm")).toHaveClass("font-mono");
		expect(screen.getByLabelText("removeFilter:GSM: 350 gsm")).toHaveClass("rounded-sm");
	});

	it("calls onClearAll when Clear all is clicked", () => {
		const onClearAll = vi.fn();
		render(
			<ActiveFilterPills
				pills={[{ group: "brand", value: "gulf-board", label: "Brand: Gulf Board" }]}
				onRemove={() => {}}
				onClearAll={onClearAll}
			/>,
		);
		fireEvent.click(screen.getByText("clearAll"));
		expect(onClearAll).toHaveBeenCalled();
	});
});
