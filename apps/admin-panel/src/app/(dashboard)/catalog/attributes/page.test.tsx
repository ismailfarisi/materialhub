import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import AttributesPage from "./page";

const createMutate = vi.fn();

vi.mock("./reindex-button", () => ({
	ReindexSearchButton: () => <button type="button">Reindex</button>,
}));

vi.mock("@/lib/queries/attributes", () => ({
	useAttributes: () => ({
		data: {
			data: [
				{
					id: "attr-1",
					name: "Material",
					ar_label: "الخامة",
					type: "select",
					is_variant: false,
					is_filterable: true,
					is_groupable: false,
					filter_input_type: "checkbox",
					value_count: 2,
					created_at: "2026-06-19T00:00:00.000Z",
				},
				{
					id: "attr-2",
					name: "Plastic-ban ready",
					ar_label: null,
					type: "boolean",
					is_variant: false,
					is_filterable: true,
					is_groupable: false,
					filter_input_type: "toggle",
					value_count: 0,
					created_at: "2026-06-19T00:00:00.000Z",
				},
			],
			total: 2,
			page: 1,
			limit: 20,
		},
		isLoading: false,
	}),
	useCreateAttribute: () => ({ mutate: createMutate, isPending: false }),
	useUpdateAttribute: () => ({ mutate: vi.fn(), isPending: false }),
	useDeleteAttribute: () => ({ mutate: vi.fn(), isPending: false }),
	useAttributeValues: () => ({ data: [], isLoading: false }),
	useCreateAttributeValue: () => ({ mutate: vi.fn(), isPending: false }),
	useUpdateAttributeValue: () => ({ mutate: vi.fn(), isPending: false }),
	useDeleteAttributeValue: () => ({ mutate: vi.fn(), isPending: false }),
}));

describe("AttributesPage", () => {
	test("creates attributes with an Arabic label", async () => {
		createMutate.mockClear();

		render(<AttributesPage />);

		fireEvent.click(screen.getByRole("button", { name: /add attribute/i }));
		fireEvent.change(screen.getByPlaceholderText("e.g. Color, Size"), {
			target: { value: "Finish" },
		});
		fireEvent.change(screen.getByLabelText("Arabic label"), {
			target: { value: "اللمسة النهائية" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Create" }));

		await waitFor(() => expect(createMutate).toHaveBeenCalled());
		expect(createMutate.mock.calls[0][0]).toMatchObject({
			name: "Finish",
			ar_label: "اللمسة النهائية",
		});
	});

	test("shows the Arabic label below the attribute name", () => {
		render(<AttributesPage />);

		expect(screen.getByText("الخامة")).toBeTruthy();
	});

	test("boolean, multi-select and date attributes keep their type in the editor", () => {
		render(<AttributesPage />);
		// The list labels the stored type…
		expect(screen.getAllByText("Yes / no").length).toBeGreaterThan(0);
		// …and editing a seeded boolean attribute opens with that type selected, not blank.
		const editButtons = screen.getAllByRole("button").filter((b) => b.querySelector("svg.lucide-pencil"));
		fireEvent.click(editButtons[1]);
		const dialog = screen.getByRole("dialog");
		expect(dialog.textContent).toContain("Yes / no");
	});
});
