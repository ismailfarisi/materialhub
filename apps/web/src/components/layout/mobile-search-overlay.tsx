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

	return (
		<div className="fixed inset-0 z-50 bg-background flex flex-col">
			<div className="sticky top-0 bg-background border-b border-border/50 flex items-center gap-2 px-3 py-2">
				<button
					type="button"
					onClick={onClose}
					aria-label={t("back")}
					className="p-2 rounded-full hover:bg-muted"
				>
					<ArrowLeft className="h-5 w-5" />
				</button>
				<form onSubmit={handleSubmit} className="relative flex-1">
					<Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
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
						placeholder={`${t("search")}...`}
						className="w-full bg-muted/50 border border-border/50 rounded-full ps-10 pr-4 py-2 text-base outline-none focus:bg-background focus:border-primary/30"
					/>
				</form>
				{query && (
					<button
						type="button"
						onClick={() => {
							setQuery("");
							inputRef.current?.focus();
						}}
						aria-label={t("clear")}
						className="p-2 rounded-full hover:bg-muted"
					>
						<X className="h-5 w-5" />
					</button>
				)}
			</div>
			<div className="flex-1 overflow-y-auto p-2">
				{hasAnyResults && data ? (
					<SearchAutocompleteResults
						data={data}
						query={query}
						activeIndex={-1}
						onSelect={() => {
							recordSearch(query);
							onClose();
						}}
					/>
				) : query.trim().length < 2 ? (
					<>
						<EmptySearchState
							onSelect={onClose}
							categories={tabs?.map((tab) => ({ label: tab.label, href: tab.href }))}
						/>
						{!hasRecents && !tabs?.length && (
							<div className="text-center text-sm text-muted-foreground/70 py-12">
								{t("searchHint")}
							</div>
						)}
					</>
				) : (
					<div className="text-center text-sm text-muted-foreground/70 py-12">
						{t("noResultsFor", { query })}
						{data?.did_you_mean && (
							<div className="mt-2">
								Did you mean{" "}
								<button
									type="button"
									className="text-primary hover:underline"
									onMouseDown={() => {
										const suggestion = data.did_you_mean ?? "";
										router.push(
											`/${locale}/search?q=${encodeURIComponent(suggestion)}`,
										);
										onClose();
									}}
								>
									&ldquo;{data.did_you_mean}&rdquo;
								</button>?
							</div>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
