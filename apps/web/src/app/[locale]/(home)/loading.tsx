"use client";

import { useTranslations } from "next-intl";

/**
 * Root loading state: a quiet Swatch Book skeleton. A board-coloured band for
 * the hero, then a row of blank swatch cards with grey tabs. No shimmer; the
 * blocks breathe slowly and stay still with reduced motion.
 *
 * A client component on purpose: Next renders loading.tsx apart from the
 * layout, so the server-side `getTranslations` here could not see the locale
 * set by the layout and fell back to reading request headers. That made every
 * statically rendered (ISR) page under it, e.g. every product page, fail with
 * DYNAMIC_SERVER_USAGE (HTTP 500). The client hook reads the messages the
 * layout already passes to NextIntlClientProvider.
 */
export default function Loading() {
	const t = useTranslations("content.loading");
	return (
		<div
			aria-busy="true"
			className="max-w-[1400px] mx-auto px-4 md:px-8 py-6 md:py-10 grid gap-10 md:gap-16 motion-safe:animate-[pulse_2.4s_ease-in-out_infinite]"
		>
			<output className="sr-only">{t("label")}</output>
			<div className="aspect-[4/3] md:aspect-[16/6] w-full rounded-md bg-nl-cacao/[0.06]" />
			<div className="grid gap-5">
				<div className="grid gap-2.5">
					<div className="h-3 w-24 rounded-sm bg-nl-cacao/[0.08]" />
					<div className="h-7 w-64 max-w-full rounded-sm bg-nl-cacao/[0.08]" />
				</div>
				<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
					{["a", "b", "c", "d"].map((k, i) => (
						<div
							key={k}
							className={`rounded-md bg-nl-pearl shadow-card overflow-hidden ${i > 1 ? "hidden md:block" : ""} ${i > 2 ? "md:hidden lg:block" : ""}`}
						>
							<div className="h-7 bg-nl-cacao/[0.08]" />
							<div className="aspect-square bg-nl-linen/70 m-3 rounded-sm" />
							<div className="px-3 pb-4 grid gap-2">
								<div className="h-4 w-4/5 rounded-sm bg-nl-cacao/[0.08]" />
								<div className="h-3 w-1/2 rounded-sm bg-nl-cacao/[0.06]" />
								<div className="flex gap-1.5 pt-1">
									<div className="h-5 w-14 rounded-sm bg-nl-cacao/[0.06]" />
									<div className="h-5 w-12 rounded-sm bg-nl-cacao/[0.06]" />
								</div>
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
