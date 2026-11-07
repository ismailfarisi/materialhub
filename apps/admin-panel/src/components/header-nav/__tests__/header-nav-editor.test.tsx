import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HeaderNavEditor } from "../header-nav-editor";
import type { HeaderNavRecord } from "../types";

const sampleDraft: HeaderNavRecord = {
	id: "x",
	version: 1,
	status: "draft",
	config: {
		tabs: [
			{
				id: "t1",
				kind: "category",
				category_id: "00000000-0000-0000-0000-000000000010",
				href_override: null,
				label: { en: "Papers & boards" },
				show_subcategories: true,
				enabled: true,
				position: 0,
				brand_list: {
					title: { en: "Brands" },
					see_all_href: "/",
					brand_ids: [],
				},
				promo_tiles: [],
			},
		],
	},
};

const upsert = vi.fn();
vi.mock("../queries", () => ({
	useHeaderNavDraft: () => ({ data: sampleDraft, isLoading: false }),
	useUpsertHeaderNavDraft: () => ({ mutate: upsert, isPending: false }),
	usePublishHeaderNav: () => ({ mutate: vi.fn(), isPending: false }),
}));

describe("HeaderNavEditor", () => {
	it("renders the first tab as selected and shows its label in the editor pane", () => {
		const qc = new QueryClient();
		render(
			<QueryClientProvider client={qc}>
				<HeaderNavEditor />
			</QueryClientProvider>,
		);
		expect(screen.getByText("Papers & boards")).toBeInTheDocument();
		expect(screen.getByDisplayValue("Papers & boards")).toBeInTheDocument();
	});

	it("deletes a tab and saves the now-empty draft", async () => {
		vi.useFakeTimers();
		upsert.mockClear();
		vi.spyOn(window, "confirm").mockReturnValue(true);
		render(
			<QueryClientProvider client={new QueryClient()}>
				<HeaderNavEditor />
			</QueryClientProvider>,
		);
		// Hydrating from the server never saves.
		await act(async () => {
			vi.advanceTimersByTime(600);
		});
		expect(upsert).not.toHaveBeenCalled();

		fireEvent.click(screen.getByRole("button", { name: "Delete tab Papers & boards" }));
		expect(screen.queryByText("Papers & boards")).not.toBeInTheDocument();
		await act(async () => {
			vi.advanceTimersByTime(600);
		});
		expect(upsert).toHaveBeenCalledWith({ tabs: [] });
		vi.useRealTimers();
	});
});
