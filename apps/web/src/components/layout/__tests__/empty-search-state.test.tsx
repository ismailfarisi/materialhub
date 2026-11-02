import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));
// Keys are echoed, with the {query} value appended where one is passed, so the
// assertions below can tell the remove buttons apart.
vi.mock("next-intl", () => ({
	useLocale: () => "en",
	useTranslations:
		() => (key: string, values?: Record<string, string>) =>
			values?.query ? `${key}:${values.query}` : key,
}));
vi.mock("@/lib/queries/recent-searches", () => ({
	useRecentSearches: () => ({
		data: [{ query: "greyboard 2mm" }, { query: "pu leather" }],
	}),
	useClearRecentSearches: () => ({ mutate: () => {} }),
}));
vi.mock("@/lib/queries/search", () => ({
	useTrendingSearches: () => ({ data: [{ query: "kraft mailer box", count: 4 }] }),
}));

import { EmptySearchState } from "../empty-search-state";

const wrap = (ui: React.ReactNode) => (
	<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>
);

describe("EmptySearchState", () => {
	test("renders recent search chips", () => {
		render(wrap(<EmptySearchState />));
		expect(screen.getByText("greyboard 2mm")).toBeTruthy();
		expect(screen.getByText("pu leather")).toBeTruthy();
		expect(screen.getByText("recent")).toBeTruthy();
	});

	test("renders the clear button", () => {
		render(wrap(<EmptySearchState />));
		expect(screen.getByText("clearRecent")).toBeTruthy();
	});

	test("renders remove buttons for each chip", () => {
		render(wrap(<EmptySearchState />));
		expect(screen.getByLabelText("removeRecent:greyboard 2mm")).toBeTruthy();
		expect(screen.getByLabelText("removeRecent:pu leather")).toBeTruthy();
	});

	test("renders trending searches", () => {
		render(wrap(<EmptySearchState />));
		expect(screen.getByText("trending")).toBeTruthy();
		expect(screen.getByText("kraft mailer box")).toBeTruthy();
	});
});
