"use client";

import { useDebouncedValue } from "@/hooks/use-debounced-value";
import type { NavTab } from "@/lib/api/navigation";
import { useRecordSearch } from "@/hooks/use-record-search";
import { useRecentSearches } from "@/lib/queries/recent-searches";
import { useSearchSuggest } from "@/lib/queries/search";
import { ArrowLeft, Search, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { EmptySearchState } from "./empty-search-state";
import { SearchAutocompleteResults } from "./search-autocomplete-results";

interface Props {
	open: boolean;
	onClose: () => void;
	tabs?: NavTab[];
}

export function MobileSearchOverlay({ open, onClose, tabs }: Props) {
	const t = useTranslations("common");
	const tb = useTranslations("browse");
	const locale = useLocale();
	const router = useRouter();
	const [query, setQuery] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);
	const debouncedQuery = useDebouncedValue(query, 200);
	const { data } = useSearchSuggest(debouncedQuery);
	const recordSearch = useRecordSearch();
	const { data: recents } = useRecentSearches();

	// Lock body scroll while open; restore on close.
	useEffect(() => {
		if (!open) return;
		const prev = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		inputRef.current?.focus();
		return () => {
			document.body.style.overflow = prev;
		};
	}, [open]);

	// Close on ESC.
	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open, onClose]);

	if (!open) return null;

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		const q = query.trim();
		if (!q) return;
		recordSearch(q);
		router.push(`/${locale}/search?q=${encodeURIComponent(q)}`);
		onClose();
	}

	const hasAnyResults =
		!!data &&
		data.products.length + data.categories.length + data.brands.length > 0;
	const hasRecents = !!recents?.length;

	const iconButton =
		"inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-nl-cacao hover:bg-nl-cacao/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nl-amber";

	return (
		<dialog
			open
			aria-modal="true"
			aria-label={t("search")}
			className="fixed inset-0 z-50 m-0 flex h-full w-full max-w-none flex-col bg-nl-linen p-0 text-nl-cacao"
		>
			<div className="sticky top-0 flex items-center gap-1 border-b border-nl-cacao/12 bg-nl-linen px-2 py-2">
				<button type="button" onClick={onClose} aria-label={t("back")} className={iconButton}>
					<ArrowLeft className="h-5 w-5 rtl:rotate-180" strokeWidth={1.75} />
				</button>
				<form onSubmit={handleSubmit} className="relative flex-1">
					<Search
						aria-hidden="true"
						className="pointer-events-none absolute start-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-nl-russet"
						strokeWidth={1.75}
					/>
					{/*
					 * text-base (16px) is deliberate: iOS Safari auto-zooms into any
					 * focused input under 16px, and this input auto-focuses on open —
					 * that zoom is what made the overlay scroll horizontally on iPhone.
					 */}
					<input
						ref={inputRef}
						type="text"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder={`${t("search")}`}
						aria-label={t("search")}
						enterKeyHint="search"
						className="h-12 w-full rounded-md border border-nl-cacao/15 bg-nl-pearl ps-10 pe-11 text-base text-nl-cacao outline-none transition-colors placeholder:text-nl-russet hover:border-nl-cacao/35 focus:border-nl-cacao"
					/>
					{query && (
						<button
							type="button"
							onClick={() => {
								setQuery("");
								inputRef.current?.focus();
							}}
							aria-label={t("clear")}
							className="absolute end-0.5 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-md text-nl-russet hover:text-nl-cacao"
						>
							<X className="h-4 w-4" strokeWidth={2} />
						</button>
					)}
				</form>
			</div>
			<div className="flex-1 overflow-y-auto overscroll-contain">
				{hasAnyResults && data ? (
					<SearchAutocompleteResults
						data={data}
						query={query}
						activeIndex={-1}
						inline
						onSelect={() => {
							recordSearch(query);
							onClose();
						}}
					/>
				) : query.trim().length < 2 ? (
					<>
						<EmptySearchState
							inline
							onSelect={onClose}
							categories={tabs?.map((tab) => ({
								label: tab.label,
								href: tab.href,
								isCategory: tab.kind === "category",
							}))}
						/>
						{!hasRecents && !tabs?.length && (
							<p className="m-0 px-4 py-12 text-center text-[14px] text-nl-russet">
								{t("searchHint")}
							</p>
						)}
					</>
				) : data ? (
					<div className="grid gap-1 px-4 py-10 text-center text-[14px]" aria-live="polite">
						<p className="m-0 font-medium text-nl-cacao">
							{tb("noResultsTitle", { query: query.trim() })}
						</p>
						{data.did_you_mean ? (
							<p className="m-0 text-nl-russet">
								{tb.rich("didYouMean", {
									suggestion: data.did_you_mean,
									link: (chunks) => (
										<button
											type="button"
											className="font-medium text-nl-cacao underline decoration-nl-cacao/30 underline-offset-4"
											onMouseDown={() => {
												const suggestion = data.did_you_mean ?? "";
												router.push(
													`/${locale}/search?q=${encodeURIComponent(suggestion)}`,
												);
												onClose();
											}}
										>
											{chunks}
										</button>
									),
								})}
							</p>
						) : (
							<p className="m-0 text-nl-russet">{tb("noResultsShortHint")}</p>
						)}
					</div>
				) : null}
			</div>
		</dialog>
	);
}
