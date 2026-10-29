import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FilterTriggerPill } from "../filter-trigger-pill";

vi.mock("next-intl", () => ({
	useTranslations: () => (key: string) => key,
}));

describe("FilterTriggerPill", () => {
	it("does not render the badge when count is zero", () => {
		render(<FilterTriggerPill activeCount={0} onOpen={() => {}} />);
		expect(screen.queryByTestId("filter-pill-badge")).not.toBeInTheDocument();
	});

	it("renders the badge with the active count", () => {
		render(<FilterTriggerPill activeCount={3} onOpen={() => {}} />);
		expect(screen.getByTestId("filter-pill-badge").textContent).toBe("3");
	});

	it("calls onOpen when clicked", () => {
		const onOpen = vi.fn();
		render(<FilterTriggerPill activeCount={1} onOpen={onOpen} />);
		fireEvent.click(screen.getByRole("button"));
		expect(onOpen).toHaveBeenCalled();
	});

	it("has lg:hidden so it disappears on desktop", () => {
		render(<FilterTriggerPill activeCount={0} onOpen={() => {}} />);
		expect(screen.getByRole("button").className).toMatch(/lg:hidden/);
	});
});
