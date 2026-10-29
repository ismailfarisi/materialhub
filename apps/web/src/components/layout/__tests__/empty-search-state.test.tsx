import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));
// EmptySearchState calls BOTH useLocale and useTranslations; omitting the
// latter threw "No 'useTranslations' export is defined on the next-intl mock".
// Echoing the key is safe here: the only translated string is t("browse"),
// which no assertion below depends on — "Recent"/"Clear all"/"Remove {query}"
// are hardcoded literals in the component.
vi.mock("next-intl", () => ({
	useLocale: () => "en",
	useTranslations: () => (key: string) => key,
}));
vi.mock("@/lib/queries/recent-searches", () => ({
	useRecentSearches: () => ({ data: [{ query: "dior" }, { query: "cerave" }] }),
	useClearRecentSearches: () => ({ mutate: () => {} }),
}));

import { EmptySearchState } from "../empty-search-state";

const wrap = (ui: React.ReactNode) => (
	<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>
);

describe("EmptySearchState", () => {
	test("renders recent search chips", () => {
		render(wrap(<EmptySearchState />));
		expect(screen.getByText("dior")).toBeTruthy();
		expect(screen.getByText("cerave")).toBeTruthy();
		expect(screen.getByText("Recent")).toBeTruthy();
	});

	test("renders Clear all button", () => {
		render(wrap(<EmptySearchState />));
		expect(screen.getByText("Clear all")).toBeTruthy();
	});

	test("renders remove buttons for each chip", () => {
		render(wrap(<EmptySearchState />));
		expect(screen.getByLabelText("Remove dior")).toBeTruthy();
		expect(screen.getByLabelText("Remove cerave")).toBeTruthy();
	});
});
