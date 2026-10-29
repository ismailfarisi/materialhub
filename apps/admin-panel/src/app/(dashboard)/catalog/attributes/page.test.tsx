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
					name: "Skin type",
					ar_label: "نوع البشرة",
					type: "select",
					is_variant: false,
					is_filterable: true,
					is_groupable: false,
					filter_input_type: "checkbox",
					value_count: 2,
					created_at: "2026-06-19T00:00:00.000Z",
				},
			],
			total: 1,
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

		expect(screen.getByText("نوع البشرة")).toBeTruthy();
	});
});
