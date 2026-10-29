import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
	api: {
		get: vi.fn(),
	},
}));

import { api } from "@/lib/api";
import { useResultCount } from "../products";

function wrapper({ children }: { children: ReactNode }) {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false, gcTime: 0 } },
	});
	return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useResultCount", () => {
	beforeEach(() => vi.clearAllMocks());

	it("calls /products with limit=0 and returns total", async () => {
		// biome-ignore lint/suspicious/noExplicitAny: test mock
		(api.get as any).mockResolvedValueOnce({
			data: { data: { total: 312, data: [], facets: {} } },
		});

		const { result } = renderHook(
			() => useResultCount({ category: "skincare", brand: "ouai" }),
			{ wrapper },
		);

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		// applyStockDefault: the count must apply the same in-stock default the
		// listing does, or "Show N results" disagrees with the results it counts.
		expect(api.get).toHaveBeenCalledWith("/products", {
			params: { category: "skincare", brand: "ouai", limit: 0, inStock: "true" },
		});
		expect(result.current.data).toBe(312);
	});

	it("omits inStock when the shopper opts into out-of-stock items", async () => {
		// biome-ignore lint/suspicious/noExplicitAny: test mock
		(api.get as any).mockResolvedValueOnce({
			data: { data: { total: 480, data: [], facets: {} } },
		});

		const { result } = renderHook(
			() => useResultCount({ category: "skincare", includeOutOfStock: "true" }),
			{ wrapper },
		);

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		// Not inverses: inStock=false would mean "only sold-out items", so
		// opting in has to drop the filter entirely.
		expect(api.get).toHaveBeenCalledWith("/products", {
			params: { category: "skincare", limit: 0 },
		});
	});
});
