import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
	useRouter: () => ({ replace }),
	useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("next-intl", () => ({
	useTranslations: () => (key: string) => key,
}));
vi.mock("@/lib/api", () => ({ api: { get: vi.fn() } }));
vi.mock("@materialhub/ui", async () => {
	// biome-ignore lint/suspicious/noExplicitAny: test mock
	const actual = await vi.importActual<any>("@materialhub/ui");
	return {
		...actual,
		// biome-ignore lint/suspicious/noExplicitAny: test mock
		Sheet: ({ open, children }: any) =>
			// biome-ignore lint/a11y/useSemanticElements: test mock for Radix Sheet
			open ? <div role="dialog">{children}</div> : null,
		// biome-ignore lint/suspicious/noExplicitAny: test mock
		SheetContent: ({ children }: any) => <div>{children}</div>,
		AttributeFilterSidebar: () => null,
	};
});

import { api } from "@/lib/api";
import { FilterSheet } from "../filter-sheet";

const facets = {
	brands: [{ value: "ouai", label: "Ouai" }],
	vendors: [],
	attributes: [],
	priceRange: { min: 0, max: 100000 },
};

function wrapper({ children }: { children: ReactNode }) {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false, gcTime: 0 } },
	});
	return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("FilterSheet", () => {
	beforeEach(() => {
		replace.mockClear();
		// biome-ignore lint/suspicious/noExplicitAny: test mock
		(api.get as any).mockResolvedValue({ data: { data: { total: 99 } } });
	});

	it("renders the sheet body when open", () => {
		render(<FilterSheet open onOpenChange={() => {}} config={facets} />, {
			wrapper,
		});
		expect(screen.getByRole("dialog")).toBeInTheDocument();
	});

	it("does not commit on toggle — only when Apply is pressed", async () => {
		const onOpenChange = vi.fn();
		render(<FilterSheet open onOpenChange={onOpenChange} config={facets} />, {
			wrapper,
		});

		fireEvent.click(screen.getByLabelText("Ouai"));
		expect(replace).not.toHaveBeenCalled();

		fireEvent.click(await screen.findByRole("button", { name: /showResults/ }));
		expect(replace).toHaveBeenCalledWith(
			expect.stringContaining("brand=ouai"),
			{ scroll: false },
		);
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("Clear all resets the draft locally (does not commit)", () => {
		render(<FilterSheet open onOpenChange={() => {}} config={facets} />, {
			wrapper,
		});
		fireEvent.click(screen.getByLabelText("Ouai"));
		fireEvent.click(screen.getByText("clearAll"));
		expect((screen.getByLabelText("Ouai") as HTMLInputElement).checked).toBe(
			false,
		);
		expect(replace).not.toHaveBeenCalled();
	});
});
