"use client";

import { BadgeCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";

interface VendorContext {
	id: string;
	slug: string;
	name: string;
	logo_url?: string | null;
	banner_url?: string | null;
	verification_type?:
		| "authorized_retailer"
		| "official_brand"
		| "verified_vendor";
}

export function VendorStorefrontHero({ vendor }: { vendor: VendorContext }) {
	const tVendor = useTranslations("vendor");

	return (
		<section className="relative">
			<div className="relative w-full h-48 md:h-64 bg-nl-linen overflow-hidden">
				{vendor.banner_url && (
					<Image
						src={vendor.banner_url}
						alt={vendor.name}
						fill
						priority
						className="object-cover"
						sizes="100vw"
					/>
				)}
			</div>

			<div className="mx-auto max-w-[1400px] px-2 md:px-8 relative -mt-12 md:-mt-16 pb-6">
				<div className="flex items-end gap-4 md:gap-6">
					<div className="relative w-24 h-24 md:w-32 md:h-32 rounded-full overflow-hidden border-4 border-background shadow-lg shrink-0 bg-background">
						{vendor.logo_url ? (
							<Image
								src={vendor.logo_url}
								alt={vendor.name}
								fill
								className="object-cover"
							/>
						) : (
							<div className="w-full h-full flex items-center justify-center text-3xl font-serif text-nl-amber">
								{vendor.name[0]}
							</div>
						)}
					</div>
					<div className="pb-1 md:pb-2">
						<h1 className="font-serif text-[clamp(2rem,5vw,3.5rem)] leading-[0.95] tracking-[-0.02em] text-nl-cacao">
							{vendor.name}
							<span className="text-nl-amber">.</span>
						</h1>
						{vendor.verification_type && (
							<span className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 text-[10px] uppercase tracking-[0.22em] bg-nl-amber/10 text-nl-amber">
								<BadgeCheck className="h-3.5 w-3.5" />
								{tVendor(vendor.verification_type)}
							</span>
						)}
					</div>
				</div>
			</div>
		</section>
	);
}
