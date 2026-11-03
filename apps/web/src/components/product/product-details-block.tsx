"use client";

import { type AccordionItem, DetailsAccordions } from "@/components/product/details-accordions";
import { SectionHead, formatFils } from "@/components/swatch";
import { useLocale, useTranslations } from "next-intl";

interface ShippingRate {
	id: string;
	zone_code?: string;
	label?: string;
	estimated_days_min?: number;
	estimated_days_max?: number;
	base_cost?: number;
}

interface ProductDetailsBlockProps {
	// biome-ignore lint/suspicious/noExplicitAny: untyped API response shape
	product: any;
	siteSettings?: Record<string, string>;
	shippingZoneRates?: ShippingRate[];
	vendorPolicies?: { return_policy?: string | null; shipping_policy?: string | null };
}

/**
 * Below the first screen: the long description, any detail bullets and pack
 * contents the vendor wrote, and the policy accordions. Specs are not here;
 * they sit in the mill label next to the price.
 */
export function ProductDetailsBlock({
	product,
	siteSettings = {},
	shippingZoneRates = [],
	vendorPolicies,
}: ProductDetailsBlockProps) {
	const t = useTranslations("pdp");
	const locale = useLocale();
	const a = product.attributes ?? {};
	const bullets: string[] = Array.isArray(a.detail_bullets) ? a.detail_bullets.filter(Boolean) : [];
	const inTheBox: string[] = Array.isArray(a.whats_in_box) ? a.whats_in_box.filter(Boolean) : [];
	const description: string = typeof product.description === "string" ? product.description.trim() : "";

	const accordions: AccordionItem[] = [];
	if (product.usage_instructions) {
		accordions.push({
			id: "usage",
			label: t("usageTitle"),
			body: <p className="m-0 whitespace-pre-line">{product.usage_instructions}</p>,
		});
	}

	const shipping = buildShipping(shippingZoneRates, vendorPolicies?.shipping_policy, t, locale);
	if (shipping) accordions.push({ id: "shipping", label: t("shippingTitle"), body: shipping });

	const windowDays = Number.parseInt(siteSettings.marketplace_return_window_days ?? "7", 10) || 7;
	const returnPolicy = vendorPolicies?.return_policy?.trim();
	accordions.push({
		id: "returns",
		label: t("returnsTitle"),
		body: (
			<div className="grid gap-3">
				<p className="m-0">{t("returnsBody", { days: windowDays })}</p>
				{returnPolicy && <p className="m-0 whitespace-pre-line">{returnPolicy}</p>}
			</div>
		),
	});

	if (siteSettings.marketplace_authenticity_guarantee) {
		accordions.push({
			id: "guarantee",
			label: t("guaranteeTitle"),
			body: <p className="m-0 whitespace-pre-line">{siteSettings.marketplace_authenticity_guarantee}</p>,
		});
	}

	const hasAbout = Boolean(description || bullets.length || inTheBox.length);

	return (
		<section className="border-t border-nl-cacao/10">
			<div className="mx-auto grid max-w-[1400px] gap-10 px-4 py-10 md:px-8 md:py-16 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-16">
				{hasAbout && (
					<div className="grid min-w-0 content-start gap-6">
						<SectionHead title={t("aboutTitle")} />
						{description && (
							<div className="grid max-w-[70ch] gap-3 text-[15px] leading-relaxed text-nl-cacao">
								{description.split(/\n{2,}/).map((para, i) => (
									<p key={`${i}-${para.slice(0, 16)}`} className="m-0 whitespace-pre-line break-words">
										{para}
									</p>
								))}
							</div>
						)}
						{bullets.length > 0 && (
							<ul className="m-0 grid max-w-[70ch] list-none gap-2 p-0 text-[15px] leading-relaxed">
								{bullets.map((b, i) => (
									<li key={`${i}-${b.slice(0, 12)}`} className="flex gap-3">
										<span aria-hidden="true" className="mt-[0.6em] h-1.5 w-1.5 shrink-0 rounded-[1px] bg-nl-cacao" />
										<span>{b}</span>
									</li>
								))}
							</ul>
						)}
						{inTheBox.length > 0 && (
							<div className="grid gap-2">
								<h3 className="mill-label m-0 text-nl-cacao">{t("inTheBox")}</h3>
								<ul className="m-0 grid list-none gap-1 border-t-2 border-nl-cacao p-0">
									{inTheBox.map((line, i) => (
										<li key={`${i}-${line.slice(0, 12)}`} className="border-b border-nl-cacao/12 py-2 text-[14px]">
											{line}
										</li>
									))}
								</ul>
							</div>
						)}
					</div>
				)}
				<div className={hasAbout ? "min-w-0 lg:pt-[52px]" : "min-w-0 lg:col-span-2 lg:max-w-[760px]"}>
					<DetailsAccordions items={accordions} />
				</div>
			</div>
		</section>
	);
}

function buildShipping(
	rates: ShippingRate[],
	policy: string | null | undefined,
	t: (key: string, values?: Record<string, string | number>) => string,
	locale: string,
) {
	const trimmed = policy?.trim();
	const uae = rates.filter((r) => r.zone_code === "UAE");
	const intl = rates.filter((r) => r.zone_code === "GCC" || r.zone_code === "INTL");
	if (uae.length + intl.length === 0 && !trimmed) return null;

	const line = (r: ShippingRate) => (
		<li key={r.id} className="font-mono text-[13px] tabular-nums text-nl-cacao">
			{t("rateLine", {
				label: r.label ?? "",
				min: r.estimated_days_min ?? 0,
				max: r.estimated_days_max ?? 0,
				cost: `AED ${formatFils(r.base_cost ?? 0, locale)}`,
			})}
		</li>
	);

	return (
		<div className="grid gap-4">
			{uae.length > 0 && (
				<div className="grid gap-1.5">
					<span className="mill-label text-nl-russet">{t("zoneUae")}</span>
					<ul className="m-0 grid list-none gap-1 p-0">{uae.map(line)}</ul>
				</div>
			)}
			{intl.length > 0 && (
				<div className="grid gap-1.5">
					<span className="mill-label text-nl-russet">{t("zoneIntl")}</span>
					<ul className="m-0 grid list-none gap-1 p-0">{intl.map(line)}</ul>
				</div>
			)}
			{trimmed && <p className="m-0 whitespace-pre-line">{trimmed}</p>}
		</div>
	);
}
