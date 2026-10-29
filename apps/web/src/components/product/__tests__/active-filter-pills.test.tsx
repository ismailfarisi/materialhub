import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ActiveFilterPills } from "../active-filter-pills";

vi.mock("next-intl", () => ({
	useTranslations: () => (key: string) => key,
}));

describe("ActiveFilterPills", () => {
	it("renders nothing when there are no filters", () => {
		const { container } = render(
			<ActiveFilterPills
				pills={[]}
				onRemove={() => {}}
				onClearAll={() => {}}
			/>,
		);
		expect(container).toBeEmptyDOMElement();
	});

	it("renders one pill per filter and calls onRemove on click", () => {
		const onRemove = vi.fn();
		render(
			<ActiveFilterPills
				pills={[
					{ group: "brand", value: "ouai", label: "Brand: Ouai" },
					{ group: "includeOutOfStock", value: "true", label: "Including out of stock" },
				]}
				onRemove={onRemove}
				onClearAll={() => {}}
			/>,
		);
		expect(screen.getByText("Brand: Ouai")).toBeInTheDocument();
		fireEvent.click(screen.getByLabelText("Remove Brand: Ouai"));
		expect(onRemove).toHaveBeenCalledWith({ group: "brand", value: "ouai" });
	});

	it("calls onClearAll when Clear all is clicked", () => {
		const onClearAll = vi.fn();
		render(
			<ActiveFilterPills
				pills={[{ group: "brand", value: "ouai", label: "Brand: Ouai" }]}
				onRemove={() => {}}
				onClearAll={onClearAll}
			/>,
		);
		fireEvent.click(screen.getByText("clearAll"));
		expect(onClearAll).toHaveBeenCalled();
	});
});
