"use client";

import { CartItem } from "@/components/cart/cart-item";
import { useCart } from "@/lib/queries/cart";
import { formatPrice } from "@/lib/utils";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";

export default function CartPage() {
	const t = useTranslations("cart");
	const tCommon = useTranslations("common");
	const locale = useLocale();
	const { data: cart, isLoading } = useCart();

	if (isLoading) {
		return (
			<div className="container py-20 text-center text-muted-foreground">
				{tCommon("loading")}
			</div>
		);
	}

	const items = cart?.items || [];

	if (items.length === 0) {
		return (
			<div className="container py-20 text-center">
				<p className="text-muted-foreground mb-4">{t("empty")}</p>
				<Link href={`/${locale}`} className="text-primary hover:underline">
					{tCommon("continueShopping")}
				</Link>
			</div>
		);
	}

	// Group by vendor
	const vendorGroups = items.reduce(
		(groups: Record<string, any[]>, item: any) => {
			const vendor = item.vendor_name || "Other";
			if (!groups[vendor]) groups[vendor] = [];
			groups[vendor].push(item);
			return groups;
		},
		{},
	);

	// Prices are VAT-inclusive (UAE 5% standard rate). subtotal = total for
	// the cart view; the embedded VAT is shown as a small "incl. VAT" hint
	// rather than a separate add-on line.
	const subtotal = items.reduce(
		(sum: number, item: any) => sum + item.current_price * item.quantity,
		0,
	);
	const total = subtotal;

	return (
		<div className="container py-6">
			<h1 className="text-2xl font-bold mb-6">{t("title")}</h1>
			<div className="flex flex-col lg:flex-row gap-8">
				<div className="flex-1 space-y-6">
					{Object.entries(vendorGroups).map(([vendor, vendorItems]) => (
						<div key={vendor}>
							<h3 className="text-sm font-medium text-muted-foreground mb-2">
								{t("vendorGroup", { vendor })}
							</h3>
							{(vendorItems as any[]).map((item: any) => (
								<CartItem key={item.variant_id} item={item} />
							))}
						</div>
					))}
				</div>

				{/* Order summary */}
				<div className="lg:w-80">
					<div className="border rounded-lg p-4 space-y-3 sticky top-20">
						<h3 className="font-semibold">{t("title")}</h3>
						<div className="flex justify-between text-sm">
							<span>{t("subtotal")}</span>
							<span>{formatPrice(subtotal)}</span>
						</div>
						<div className="flex justify-between font-semibold border-t pt-3">
							<span>{t("total")}</span>
							<span>{formatPrice(total)}</span>
						</div>
						<p className="text-xs text-muted-foreground text-right">
							Prices include 5% VAT
						</p>
						<Link
							href={`/${locale}/checkout`}
							className="block text-center bg-primary text-primary-foreground py-3 rounded-lg font-medium hover:bg-primary/90"
						>
							{t("checkout")}
						</Link>
					</div>
				</div>
			</div>
		</div>
	);
}
