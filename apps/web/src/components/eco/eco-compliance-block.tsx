"use client";

import { MillLabel, type Spec } from "@/components/swatch";
import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import {
	BAG_THICKNESS_SLUG,
	PLASTIC_BAN_BAG_MIN_MICRONS,
	bagThicknessMicrons,
	ecoRows,
	ecoValueKey,
	isPlasticBanReady,
} from "./eco-data";
import { PlasticBanBadge } from "./plastic-ban-badge";

/**
 * Packaging compliance, printed as a second mill label directly under the
 * product's spec table: the compliance attributes the supplier filled in, then
 * the state of the plastic-ban declaration, then one factual line on what
 * that state means. Renders nothing for products without either.
 */
export function EcoComplianceBlock({
	// biome-ignore lint/suspicious/noExplicitAny: untyped API response shape
	product,
}: {
	// biome-ignore lint/suspicious/noExplicitAny: untyped API response shape
	product: any;
}) {
	const t = useTranslations("eco");
	const rows = ecoRows(product);
	const ready = isPlasticBanReady(product);
	if (rows.length === 0 && !ready) return null;

	const specs: Spec[] = rows.map((row) => ({
		label: t(`attributes.${row.key}`),
		value:
			row.key === BAG_THICKNESS_SLUG
				? t("micronsValue", { value: row.values[0]?.label ?? "" })
				: row.values
						.map((v) => {
							const key = ecoValueKey(row.key, v.slug);
							return key ? t(key) : v.label;
						})
						.join(", "),
	}));
	specs.push({
		label: t("declarationRow"),
		value: ready ? t("declarationApproved") : t("declarationNone"),
	});

	const microns = bagThicknessMicrons(product);
	const thinBag = microns != null && microns < PLASTIC_BAN_BAG_MIN_MICRONS;
	const withCertificate = product?.ecoDeclaration?.has_certificate === true;

	return (
		<section aria-labelledby="pdp-eco" className="grid gap-2">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<h2 id="pdp-eco" className="mill-label m-0 text-nl-cacao">
					{t("complianceTitle")}
				</h2>
				{ready && <PlasticBanBadge size="pdp" />}
			</div>
			<MillLabel specs={specs} />
			{thinBag && (
				<p className="m-0 flex items-start gap-2 text-[13px] leading-snug text-nl-cacao">
					<AlertTriangle
						aria-hidden="true"
						className="mt-0.5 h-4 w-4 shrink-0 text-status-warning"
						strokeWidth={2}
					/>
					{t("thinBagNote", { microns: PLASTIC_BAN_BAG_MIN_MICRONS })}
				</p>
			)}
			<p className="m-0 max-w-[62ch] text-[12.5px] leading-relaxed text-nl-russet">
				{ready
					? withCertificate
						? t("noteApprovedWithCertificate")
						: t("noteApproved")
					: t("noteNotDeclared")}
			</p>
		</section>
	);
}
