"use client";

import { Button } from "@/components/swatch";
import { FileText } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";

/**
 * Product page entry to RFQ. One insertion point in the purchase panel;
 * outline, never orange: Add to cart keeps the one signal button.
 */
export function RequestQuoteLink({
	productId,
	variantId,
	quantity,
	categorySlug,
}: {
	productId: string;
	variantId?: string | null;
	quantity?: number;
	/** Leaf category, so the form can offer other suppliers of the same material. */
	categorySlug?: string | null;
}) {
	const t = useTranslations("rfq.entry");
	const locale = useLocale();
	const params = new URLSearchParams({ product: productId });
	if (variantId) params.set("variant", variantId);
	if (quantity && quantity > 1) params.set("qty", String(quantity));
	if (categorySlug) params.set("category", categorySlug);

	return (
		<div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-nl-cacao/12 px-3.5 py-3">
			<p className="m-0 min-w-0 flex-1 basis-56 text-[13px] leading-snug text-nl-russet">
				{t("pdpHint")}
			</p>
			<Button asChild variant="outline" size="sm" className="shrink-0">
				<Link href={`/${locale}/account/quotes/new?${params.toString()}`}>
					<FileText className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
					{t("pdpButton")}
				</Link>
			</Button>
		</div>
	);
}
