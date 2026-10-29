"use client";

import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useRecordSearch } from "@/hooks/use-record-search";
import { useSearchSuggest } from "@/lib/queries/search";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { EmptySearchState } from "./empty-search-state";
import { SearchAutocompleteResults } from "./search-autocomplete-results";

/** `/en/search`, `/ar/search` — locale prefix is always present, but tolerate its absence. */
const SEARCH_PATH = /^\/(?:[a-z]{2}\/)?search\/?$/;

const INPUT_CLASS =
	"w-full bg-transparent border-0 outline-none text-sm text-nl-cacao placeholder:text-nl-russet/60 font-sans";

/**
 * Prerender stand-in for the Suspense boundary in `header.tsx`.
 *
 * `SearchAutocomplete` reads `useSearchParams()`, which opts its subtree out of
 * static rendering. The header sits in the shared layout, so without a boundary
 * that bailout would take every storefront page down with it. Rendering the same
 * input shape (just inert) keeps the header from reflowing on hydration.
 */
export function SearchAutocompleteFallback() {
	const t = useTranslations("common");
	return (
		<div className="w-full">
			<input
				type="text"
				disabled
				placeholder={`${t("search")}...`}
				className={INPUT_CLASS}
			/>
		</div>
	);
}

export function SearchAutocomplete() {
	const t = useTranslations("common");
	const locale = useLocale();
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const [query, setQuery] = useState("");
	const [isOpen, setIsOpen] = useState(false);
	const [activeIndex, setActiveIndex] = useState(-1);
	const inputRef = useRef<HTMLInputElement>(null);
	const debouncedQuery = useDebouncedValue(query, 200);
	// Only fetch while the panel is actually open. Previously a non-empty query
	// implied the user had focused and typed; now that the input is prefilled
	// from ?q= on the results page, an ungated call would fire a suggest request
	// on every search page load for a dropdown nobody opened.
	const { data } = useSearchSuggest(isOpen ? debouncedQuery : "");
	const recordSearch = useRecordSearch();

	// Flatten the three buckets into a keyboard-navigable list, preserving
	// visual order (categories → brands → products).
	const flatRows = useMemo(() => {
		if (!data)
			return [] as Array<{
				kind: "category" | "brand" | "product";
				href: string;
				payload: unknown;
			}>;
		return [
			...data.categories.map((c) => ({
				kind: "category" as const,
				href: `/${locale}/c/${c.slug}`,
				payload: c,
			})),
			...data.brands.map((b) => ({
				kind: "brand" as const,
				href: `/${locale}/brand/${b.slug}`,
				payload: b,
			})),
			...data.products.map((p) => ({
				kind: "product" as const,
				href: `/${locale}/product/${p.slug}`,
				payload: p,
			})),
		];
	}, [data, locale]);

	// Reset highlight when rows change (which happens when debouncedQuery triggers a fetch).
	// biome-ignore lint/correctness/useExhaustiveDependencies: setActiveIndex has no captured deps
	useEffect(() => setActiveIndex(-1), [debouncedQuery]);

	// The header is mounted in the persistent [locale] layout, so this component
	// is never remounted by a client-side navigation — including browser Back.
	// Left to itself the input would keep whatever was last typed forever, so
	// drive it from the URL instead: mirror ?q= while on the results page (the
	// query stays editable there) and clear it on every other route.
	//
	// Deliberately keyed on the *value* of q rather than the searchParams object:
	// applying a facet on the results page rewrites the URL without touching q,
	// and that must not wipe a query the user is halfway through retyping.
	const urlQuery = SEARCH_PATH.test(pathname ?? "")
		? (searchParams.get("q") ?? "")
		: "";
	// biome-ignore lint/correctness/useExhaustiveDependencies: `pathname` is load-bearing.
	// urlQuery is "" for every non-search route, so moving between two of them
	// leaves it unchanged — only the pathname marks that a navigation happened,
	// and without it typed-but-unsubmitted text would survive the move.
	useEffect(() => {
		setQuery(urlQuery);
	}, [pathname, urlQuery]);

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		const q = query.trim();
		if (!q) return;
		recordSearch(q);
		router.push(`/${locale}/search?q=${encodeURIComponent(q)}`);
		setIsOpen(false);
	}

	function handleKeyDown(e: React.KeyboardEvent) {
		const total = flatRows.length;
		if (!total) return;
		if (e.key === "ArrowDown") {
			e.preventDefault();
			setActiveIndex((i) => (i + 1) % total);
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			setActiveIndex((i) => (i - 1 + total) % total);
		} else if (e.key === "Enter" && activeIndex >= 0) {
			e.preventDefault();
			router.push(flatRows[activeIndex].href);
			setIsOpen(false);
		}
	}

	const hasAnyResults =
		!!data &&
		data.products.length + data.categories.length + data.brands.length > 0;

	return (
		<div className="w-full">
			<form onSubmit={handleSubmit}>
				<input
					ref={inputRef}
					type="text"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					onFocus={() => setIsOpen(true)}
					onBlur={() => setTimeout(() => setIsOpen(false), 200)}
					onKeyDown={handleKeyDown}
					placeholder={`${t("search")}...`}
					className={INPUT_CLASS}
				/>
			</form>
			{isOpen && (
				<div className="absolute top-full mt-2 left-0 right-0 z-50">
					{hasAnyResults && data ? (
						<SearchAutocompleteResults
							data={data}
							query={query}
							activeIndex={activeIndex}
							onSelect={() => {
								recordSearch(query);
								setIsOpen(false);
							}}
						/>
					) : debouncedQuery.trim().length >= 2 && data?.did_you_mean ? (
						<div className="bg-background border border-border/60 rounded-2xl shadow-xl shadow-black/5 p-4 text-center text-sm">
							No results for &ldquo;{query}&rdquo;.<br />
							Did you mean{" "}
							<button
								type="button"
								className="text-primary hover:underline"
								onMouseDown={() => {
									const suggestion = data?.did_you_mean ?? "";
									router.push(
										`/${locale}/search?q=${encodeURIComponent(suggestion)}`,
									);
									setIsOpen(false);
								}}
							>
								&ldquo;{data.did_you_mean}&rdquo;
							</button>?
						</div>
					) : debouncedQuery.trim().length < 2 ? (
						<EmptySearchState onSelect={() => setIsOpen(false)} />
					) : null}
				</div>
			)}
		</div>
	);
}
