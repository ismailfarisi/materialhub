"use client";

import { ChevronDown, Globe } from "lucide-react";
import { useLocale } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { routing } from "../../../i18n/routing";

const localeLabels: Record<string, { short: string; name: string }> = {
	en: { short: "EN", name: "English" },
	ar: { short: "AR", name: "العربية" },
};

/** Language picker for the binder-black utility bar. Native select, styled. */
export function LocaleSwitcher() {
	const locale = useLocale();
	const router = useRouter();
	const pathname = usePathname();

	function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
		const next = e.target.value;
		const rest = pathname.replace(new RegExp(`^/${locale}(?=/|$)`), "");
		router.replace(`/${next}${rest}`);
	}

	return (
		<label className="relative inline-flex items-center gap-1.5 h-7 rounded-sm px-1 text-nl-pearl/80 hover:text-nl-pearl transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-nl-amber">
			<Globe className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
			<span className="sr-only">Language</span>
			<select
				value={locale}
				onChange={handleChange}
				className="bg-transparent text-[12.5px] font-medium appearance-none cursor-pointer outline-none pe-4"
			>
				{routing.locales.map((loc) => (
					<option key={loc} value={loc} lang={loc} aria-label={localeLabels[loc]?.name} className="text-nl-cacao bg-nl-pearl">
						{localeLabels[loc]?.short ?? loc.toUpperCase()}
					</option>
				))}
			</select>
			<ChevronDown className="pointer-events-none absolute end-1 h-3 w-3 opacity-70" strokeWidth={2} aria-hidden="true" />
		</label>
	);
}
