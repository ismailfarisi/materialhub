"use client";

import { Button } from "@/components/swatch";
import { useConsent } from "@/lib/consent/consent-state";
import { useTranslations } from "next-intl";

/**
 * Cookie consent. A compact, non-modal card: on phones it floats above the
 * mobile tab bar (never over it), on desktop it sits in the start corner so
 * the page stays usable behind it. Equal-weight choices, no dark pattern.
 */
export function ConsentBanner() {
	const { decision, setDecision } = useConsent();
	const t = useTranslations("consent");

	if (decision !== null) return null;

	return (
		<dialog
			open
			aria-labelledby="consent-banner-title"
			aria-describedby="consent-banner-desc"
			className="fixed z-50 m-0 max-w-none w-auto inset-x-3 bottom-[calc(3.5rem+env(safe-area-inset-bottom)+0.75rem)] lg:inset-x-auto lg:start-5 lg:bottom-5 lg:w-[400px] rounded-md bg-nl-pearl shadow-lift border border-nl-cacao/10 p-4 text-nl-cacao"
		>
			<h2 id="consent-banner-title" className="font-display text-[15px] font-semibold leading-tight m-0">
				{t("title")}
			</h2>
			<p
				id="consent-banner-desc"
				className="mt-1.5 text-[13px] leading-[1.5] text-nl-russet m-0"
			>
				{t("description")}
			</p>
			<div className="mt-3 grid grid-cols-2 gap-2">
				<Button variant="outline" size="sm" onClick={() => setDecision("rejected")}>
					{t("reject")}
				</Button>
				<Button variant="primary" size="sm" onClick={() => setDecision("accepted")}>
					{t("accept")}
				</Button>
			</div>
		</dialog>
	);
}
