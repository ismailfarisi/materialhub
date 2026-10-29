import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));
vi.mock("next-intl", () => ({
	useLocale: () => "en",
	useTranslations: () => (k: string) => k,
}));
vi.mock("@/lib/queries/search", () => ({
	useSearchSuggest: () => ({ data: undefined }),
	useTrendingSearches: () => ({ data: [] }),
}));
vi.mock("@/lib/queries/recent-searches", () => ({
	useRecentSearches: () => ({ data: [] }),
	useClearRecentSearches: () => ({ mutate: () => {} }),
	useRecordRecentSearch: () => ({ mutate: () => {} }),
}));
vi.mock("@/hooks/use-record-search", () => ({
	useRecordSearch: () => () => {},
}));

import { MobileSearchOverlay } from "../mobile-search-overlay";

const wrap = (ui: React.ReactNode) => (
	<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>
);

describe("MobileSearchOverlay", () => {
	test("doesn't render when closed", () => {
		const { container } = render(
			wrap(<MobileSearchOverlay open={false} onClose={() => {}} />),
		);
		expect(container.firstChild).toBeNull();
	});

	test("locks body scroll on open and restores on close", () => {
		const { rerender } = render(
			wrap(<MobileSearchOverlay open={true} onClose={() => {}} />),
		);
		expect(document.body.style.overflow).toBe("hidden");
		rerender(wrap(<MobileSearchOverlay open={false} onClose={() => {}} />));
		expect(document.body.style.overflow).toBe("");
	});

	test("ESC calls onClose", () => {
		let closed = false;
		render(
			wrap(
				<MobileSearchOverlay
					open={true}
					onClose={() => {
						closed = true;
					}}
				/>,
			),
		);
		fireEvent.keyDown(window, { key: "Escape" });
		expect(closed).toBe(true);
	});
});
