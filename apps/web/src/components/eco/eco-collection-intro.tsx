import { useTranslations } from "next-intl";
import { PLASTIC_BAN_COLLECTION_SLUG } from "./eco-data";

/**
 * Landing copy for the "Plastic-ban ready packaging" collection: what the ban
 * covers and what the badge does and does not mean. Rendered by the
 * collection page; returns nothing for every other collection.
 */
export function EcoCollectionIntro({ slug }: { slug: string }) {
	const t = useTranslations("eco");
	if (slug !== PLASTIC_BAN_COLLECTION_SLUG) return null;
	const covered = ["cups", "lids", "cutlery", "plates", "straws", "stirrers", "foam", "bags"] as const;
	return (
		<section
			aria-labelledby="eco-landing"
			className="mb-6 grid gap-5 rounded-md bg-nl-pearl p-4 shadow-card md:mb-8 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] md:gap-10 md:p-6"
		>
			<div className="grid content-start gap-3">
				<h2
					id="eco-landing"
					className="m-0 font-display text-[19px] font-semibold leading-tight tracking-[-0.01em] text-nl-cacao"
				>
					{t("landingTitle")}
				</h2>
				<p className="m-0 max-w-[65ch] text-[15px] leading-relaxed text-nl-cacao">{t("landingBody")}</p>
				<p className="m-0 max-w-[65ch] text-[13.5px] leading-relaxed text-nl-russet">
					{t("landingDisclaimer")}
				</p>
			</div>
			<div className="grid content-start gap-2">
				<h3 className="mill-label m-0 text-nl-russet">{t("landingCoveredTitle")}</h3>
				<ul className="m-0 grid list-none grid-cols-2 border-t-2 border-nl-cacao p-0">
					{covered.map((k) => (
						<li key={k} className="border-b border-nl-cacao/12 py-2 pe-3 text-[13.5px] text-nl-cacao">
							{t(`covered.${k}`)}
						</li>
					))}
				</ul>
				<p className="m-0 text-[12.5px] text-nl-russet">{t("landingSince")}</p>
			</div>
		</section>
	);
}
