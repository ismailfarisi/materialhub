"use client";

import {
	BadgeCheck,
	Clock,
	Lock,
	RefreshCw,
	Shield,
	Star,
	Truck,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import { ProductCard } from "./product-card";

interface VendorData {
	id: string;
	slug?: string;
	name: string;
	logo_url?: string;
	tagline?: string;
	positive_rating_pct?: number;
	response_time?: string;
	shipping_speed?: string;
	product_count?: number;
	verification_type?:
		| "authorized_retailer"
		| "official_brand"
		| "verified_vendor";
}

interface VendorStorefrontProps {
	vendor: VendorData;
	vendorProducts?: any[];
}

export function VendorStorefront({
	vendor,
	vendorProducts,
}: VendorStorefrontProps) {
	const locale = useLocale();
	const tCommon = useTranslations("common");
	const tVendor = useTranslations("vendor");

	const trustItems = [
		{ icon: Shield, label: tCommon("authentic") },
		{ icon: Truck, label: tCommon("freeDeliveryUAE") },
		{ icon: RefreshCw, label: tCommon("easyReturns") },
		{ icon: Lock, label: tCommon("securePayment") },
	];

	return (
		<section className="py-12 md:py-16 bg-warm">
			<div className="container space-y-8">
				<div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
					<div className="flex items-center gap-3 flex-1">
						{vendor.logo_url ? (
							<div className="relative w-14 h-14 rounded-full overflow-hidden border-2 border-copper shrink-0">
								<Image
									src={vendor.logo_url}
									alt={vendor.name}
									fill
									className="object-cover"
								/>
							</div>
						) : (
							<div className="w-14 h-14 rounded-full bg-copper/10 flex items-center justify-center shrink-0">
								<span className="text-lg font-serif font-bold text-copper">
									{vendor.name[0]}
								</span>
							</div>
						)}
						<div>
							<div className="flex items-center gap-2">
								<h3 className="font-serif font-bold text-lg">{vendor.name}</h3>
								{vendor.verification_type && (
									<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-copper/10 text-copper">
										<BadgeCheck className="h-3 w-3" />
										{tVendor(vendor.verification_type)}
									</span>
								)}
							</div>
							{vendor.tagline && (
								<p className="text-sm text-muted-foreground">
									{vendor.tagline}
								</p>
							)}
						</div>
					</div>

					<Link
						href={`/${locale}/vendor/${vendor.slug ?? vendor.id}`}
						className="px-5 py-2.5 rounded-full border-2 border-copper text-copper text-sm font-medium hover:bg-copper/5 transition shrink-0"
					>
						{tCommon("visitStore")}
					</Link>
				</div>

				<div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
					{vendor.positive_rating_pct != null && (
						<span className="flex items-center gap-1.5">
							<Star className="h-3.5 w-3.5 text-copper" />
							{tCommon("positiveRating", { pct: vendor.positive_rating_pct })}
						</span>
					)}
					{vendor.response_time && (
						<span className="flex items-center gap-1.5">
							<Clock className="h-3.5 w-3.5 text-copper" />
							{tCommon("respondsIn", { time: vendor.response_time })}
						</span>
					)}
					{vendor.shipping_speed && (
						<span className="flex items-center gap-1.5">
							<Truck className="h-3.5 w-3.5 text-copper" />
							{tCommon("shipsIn", { time: vendor.shipping_speed })}
						</span>
					)}
					{vendor.product_count != null && (
						<span>
							{tCommon("products", {
								count: vendor.product_count?.toLocaleString(),
							})}
						</span>
					)}
				</div>

				{vendorProducts && vendorProducts.length > 0 && (
					<div>
						<h3 className="text-sm font-semibold uppercase tracking-wide mb-3">
							{tCommon("moreFrom", { name: vendor.name })}
						</h3>
						<div className="flex gap-4 overflow-x-auto scrollbar-hide pb-2">
							{vendorProducts.map((product: any) => (
								<div key={product.id} className="shrink-0 w-56">
									<ProductCard product={product} />
								</div>
							))}
						</div>
					</div>
				)}

				<div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-6 border-t border-border">
					{trustItems.map((item) => (
						<div
							key={item.label}
							className="flex items-center gap-2.5 justify-center text-sm"
						>
							<item.icon className="h-5 w-5 text-copper" />
							<span className="font-medium">{item.label}</span>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}
