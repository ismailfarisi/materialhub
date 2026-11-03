"use client";

import { MillLabel, PriceTag, formatFils } from "@/components/swatch";
import { useRemoveCartItem, useUpdateCartItem } from "@/lib/queries/cart";
import { cn } from "@/lib/utils";
import { AlertCircle, Info, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { type CartLineItem, isLineUnavailable, lineSpecs, lineTotalFils } from "./cart-lines";
import { LineThumb } from "./line-thumb";
import { QtyStepper } from "./qty-stepper";

function errorMessage(err: unknown): string | null {
	if (!err) return null;
	const e = err as { response?: { data?: { message?: string } }; message?: string };
	return e.response?.data?.message || null;
}

/**
 * One cart line: thumbnail, title, specs as mill-label chips, unit price,
 * quantity stepper and line total. `compact` is the slide-over density.
 */
export function CartItem({
	item,
	compact = false,
	notice,
	onNavigate,
}: {
	item: CartLineItem;
	compact?: boolean;
	/** Extra line-level problem to show, e.g. "Can't be delivered to this address". */
	notice?: string | null;
	/** Called when the shopper follows the product link (e.g. to close the cart slide-over). */
	onNavigate?: () => void;
}) {
	const t = useTranslations("cart");
	const locale = useLocale();
	const updateItem = useUpdateCartItem();
	const removeItem = useRemoveCartItem();

	const unavailable = isLineUnavailable(item);
	const specs = lineSpecs(item);
	const productHref = item.product_slug ? `/${locale}/product/${item.product_slug}` : null;
	const pending = updateItem.isPending || removeItem.isPending;
	const updateError = errorMessage(updateItem.error) ?? (updateItem.isError ? t("updateFailed") : null);
	const removeError = removeItem.isError ? t("removeFailed") : null;
	const priceChanged =
		item.is_stale && item.added_price != null && item.added_price !== item.current_price;

	const thumbClass = compact ? "w-16" : "w-[72px] sm:w-[88px]";
	const thumb = <LineThumb src={item.image_url} size={compact ? 64 : 88} dimmed={unavailable} className={thumbClass} />;

	return (
		<div
			className={cn(
				"grid items-start gap-x-3 sm:gap-x-4",
				compact ? "grid-cols-[64px_minmax(0,1fr)] py-4" : "grid-cols-[72px_minmax(0,1fr)] sm:grid-cols-[88px_minmax(0,1fr)] py-5",
				removeItem.isPending && "opacity-50 transition-opacity",
			)}
		>
			{productHref ? (
				<Link href={productHref} onClick={onNavigate} tabIndex={-1} aria-hidden="true" className="block">
					{thumb}
				</Link>
			) : (
				thumb
			)}

			<div className="min-w-0 grid gap-2">
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0 grid gap-1">
						<h3 className="m-0 font-display text-[15px] font-semibold leading-snug tracking-[-0.01em] text-nl-cacao line-clamp-2 break-words">
							{productHref ? (
								<Link
									href={productHref}
									onClick={onNavigate}
									className="underline-offset-[3px] decoration-nl-cacao/30 hover:underline focus-visible:underline"
								>
									{item.product_title}
								</Link>
							) : (
								item.product_title
							)}
						</h3>
						<div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[13px] text-nl-russet">
							<PriceTag amount={item.current_price} locale={locale} unit={t("perUnit")} size="sm" />
							{item.sku && <span dir="ltr" className="font-mono text-[11.5px] text-nl-russet/90 truncate">{item.sku}</span>}
						</div>
					</div>
					{!compact && (
						<div className="hidden sm:block text-end shrink-0">
							<span className="sr-only">{t("lineTotal")}</span>
							<PriceTag amount={lineTotalFils(item)} locale={locale} size="md" />
						</div>
					)}
				</div>

				{specs.length > 0 && <MillLabel specs={specs} variant="inline" className="[&_li]:[direction:ltr] [&_li]:[unicode-bidi:isolate]" />}

				{unavailable && (
					<p className="m-0 flex items-start gap-1.5 text-[13px] text-destructive">
						<AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
						{t("unavailable")}
					</p>
				)}
				{notice && !unavailable && (
					<p className="m-0 flex items-start gap-1.5 text-[13px] text-destructive">
						<AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
						{notice}
					</p>
				)}
				{priceChanged && (
					<p className="m-0 flex items-start gap-1.5 text-[13px] text-nl-russet">
						<Info className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
						<span>
							{t("priceChangedFrom", {
								amount: `AED ${formatFils(item.added_price ?? 0, locale)}`,
							})}
						</span>
					</p>
				)}

				<div className="flex items-center justify-between gap-3 pt-1">
					<div className="flex items-center gap-1">
						<QtyStepper
							value={item.quantity}
							size={compact ? "sm" : "md"}
							pending={pending}
							max={unavailable ? item.quantity : undefined}
							onChange={(quantity) => updateItem.mutate({ variantId: item.variant_id, quantity })}
							label={t("qtyFor", { product: item.product_title })}
							decreaseLabel={t("decrease")}
							increaseLabel={t("increase")}
						/>
						<button
							type="button"
							onClick={() => removeItem.mutate(item.variant_id)}
							disabled={removeItem.isPending}
							aria-label={t("removeLine", { product: item.product_title })}
							className={cn(
								"inline-flex items-center gap-1.5 rounded-md text-[13px] text-nl-russet transition-colors hover:text-nl-cacao hover:bg-nl-cacao/[0.06] disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-nl-amber",
								compact ? "h-8 w-8 justify-center" : "h-10 px-2.5",
							)}
						>
							<Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
							{!compact && <span className="hidden sm:inline">{t("removeShort")}</span>}
						</button>
					</div>
					<div className={cn("text-end", !compact && "sm:hidden")}>
						<span className="sr-only">{t("lineTotal")}</span>
						<PriceTag amount={lineTotalFils(item)} locale={locale} size="sm" />
					</div>
				</div>

				{(updateError || removeError) && (
					<p role="alert" className="m-0 flex items-start gap-1.5 text-[13px] text-destructive">
						<AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
						{updateError ?? removeError}
					</p>
				)}
			</div>
		</div>
	);
}
