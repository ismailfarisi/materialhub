import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

// Held in a hoisted object so the hooks return a STABLE identity across
// renders — a fresh URLSearchParams per call would change effect deps every
// render and spin the component into an infinite render loop.
const nav = vi.hoisted(() => ({
	pathname: "/en",
	params: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
	useRouter: () => ({ push: () => {} }),
	usePathname: () => nav.pathname,
	useSearchParams: () => nav.params,
}));
vi.mock("next-intl", () => ({
	useLocale: () => "en",
	useTranslations: () => (k: string) => k,
}));
// Records every query the component actually asks the suggest endpoint for.
const suggest = vi.hoisted(() => ({ calls: [] as string[] }));

vi.mock("@/lib/queries/search", () => ({
	useSearchSuggest: (q: string) => {
		suggest.calls.push(q);
		return {
			data: {
				products: [
					{
						id: "p1",
						slug: "art-board-350",
						name: "Art board, matte 350 gsm",
						image_url: null,
						price_min: 48000,
						price_max: 48000,
					},
				],
				categories: [{ id: "c1", name: "Papers & Boards", slug: "papers-boards" }],
				brands: [{ id: "b1", name: "Gulf Board", slug: "gulf-board" }],
				did_you_mean: null,
			},
		};
	},
}));
vi.mock("@/lib/queries/recent-searches", () => ({
	useRecentSearches: () => ({ data: [] }),
	useClearRecentSearches: () => ({ mutate: () => {} }),
	useRecordRecentSearch: () => ({ mutate: () => {} }),
}));
vi.mock("@/hooks/use-record-search", () => ({
	useRecordSearch: () => () => {},
}));

import { SearchAutocomplete } from "../search-autocomplete";

const wrap = (ui: React.ReactNode) => {
	const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
};

describe("SearchAutocomplete", () => {
	beforeEach(() => {
		nav.pathname = "/en";
		nav.params = new URLSearchParams();
	});

	test("renders the three buckets when input is focused", async () => {
		render(wrap(<SearchAutocomplete />));
		const input = screen.getByRole("textbox");
		input.focus();
		expect(await screen.findByText("Papers & Boards")).toBeTruthy();
		expect(await screen.findByText("Gulf Board")).toBeTruthy();
		expect(await screen.findByText("Art board, matte 350 gsm")).toBeTruthy();
	});
});

// The header lives in the persistent [locale] layout, so this component is
// never remounted by a client-side navigation. Its input must therefore be
// driven by the URL, not by whatever the user last typed into it.
describe("SearchAutocomplete URL sync", () => {
	const input = () => screen.getByRole("textbox") as HTMLInputElement;

	beforeEach(() => {
		nav.pathname = "/en";
		nav.params = new URLSearchParams();
	});

	test("prefills from ?q= on the search results page", () => {
		nav.pathname = "/en/search";
		nav.params = new URLSearchParams("q=greyboard");

		render(wrap(<SearchAutocomplete />));

		expect(input().value).toBe("greyboard");
	});

	test("clears the input when navigating back off the search page", () => {
		nav.pathname = "/en/search";
		nav.params = new URLSearchParams("q=greyboard");

		const qc = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		const ui = () => (
			<QueryClientProvider client={qc}>
				<SearchAutocomplete />
			</QueryClientProvider>
		);
		const { rerender } = render(ui());
		expect(input().value).toBe("greyboard");

		// Browser Back to the page the search was launched from. The layout —
		// and therefore this component instance — survives the navigation.
		nav.pathname = "/en";
		nav.params = new URLSearchParams();
		rerender(ui());

		expect(input().value).toBe("");
	});

	test("clears typed-but-unsubmitted text when moving between other pages", () => {
		// Both routes have no ?q=, so the synced value is "" either way. The effect
		// must still re-run on the pathname change — this is why `pathname` is a
		// dependency even though the callback never reads it.
		nav.pathname = "/en/about";

		const qc = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		const ui = () => (
			<QueryClientProvider client={qc}>
				<SearchAutocomplete />
			</QueryClientProvider>
		);
		const { rerender } = render(ui());

		fireEvent.change(input(), { target: { value: "abandoned" } });

		nav.pathname = "/en/press";
		rerender(ui());

		expect(input().value).toBe("");
	});

	test("does not fetch suggestions for a prefilled query nobody opened", () => {
		nav.pathname = "/en/search";
		nav.params = new URLSearchParams("q=greyboard");
		suggest.calls.length = 0;

		render(wrap(<SearchAutocomplete />));

		expect(input().value).toBe("greyboard");
		// The dropdown was never opened, so no suggest request should go out.
		expect(suggest.calls.filter((q) => q !== "")).toEqual([]);
	});

	test("keeps in-progress typing when only filter params change", () => {
		nav.pathname = "/en/search";
		nav.params = new URLSearchParams("q=greyboard");

		const qc = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		const ui = () => (
			<QueryClientProvider client={qc}>
				<SearchAutocomplete />
			</QueryClientProvider>
		);
		const { rerender } = render(ui());

		fireEvent.change(input(), { target: { value: "kraft" } });

		// Applying a facet on the results page rewrites the URL but leaves ?q=
		// untouched; that must not clobber what the user is halfway through typing.
		nav.params = new URLSearchParams("q=greyboard&brand=gulf-board");
		rerender(ui());

		expect(input().value).toBe("kraft");
	});
});
