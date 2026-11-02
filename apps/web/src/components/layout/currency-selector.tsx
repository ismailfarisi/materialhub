"use client";

import { usePreferencesStore } from "@/stores/preferences";

const currencies = ["AED"];

/**
 * Display currency for the utility bar. Only AED is supported (prices are
 * stored and charged in AED), so a single currency renders as plain text
 * inside the select rather than a picker with nothing to pick.
 */
export function CurrencySelector() {
	const { currency, setCurrency } = usePreferencesStore();
	const single = currencies.length === 1;

	return (
		<label className="relative inline-flex items-center h-7 rounded-sm px-1 text-nl-pearl/80 focus-within:outline focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-nl-amber">
			<span className="sr-only">Currency</span>
			<select
				value={currency}
				onChange={(e) => setCurrency(e.target.value)}
				disabled={single}
				className="bg-transparent font-mono text-[12px] tabular-nums appearance-none outline-none enabled:cursor-pointer disabled:opacity-100 disabled:text-nl-pearl/80"
			>
				{currencies.map((c) => (
					<option key={c} value={c} className="text-nl-cacao bg-nl-pearl">
						{c}
					</option>
				))}
			</select>
		</label>
	);
}
