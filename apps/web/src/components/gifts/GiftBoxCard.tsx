import Image from "next/image";
import Link from "next/link";
import type { GiftBoxDetail } from "@/lib/api/gifts";
import { formatPrice } from "@/lib/utils";

interface GiftBoxCardProps {
	entry: GiftBoxDetail;
	locale: string;
	/** Optional occasion label shown as a tag chip. */
	occasionName?: string;
}

export function GiftBoxCard({ entry, locale, occasionName }: GiftBoxCardProps) {
	const { box, price } = entry;
	const image = box.hero_image_url || box.style?.images?.[0] || null;
	const href = `/${locale}/gifts/box/${box.slug}`;
	const itemCount = (box.items || []).reduce(
		(sum, it) => sum + (it.quantity || 0),
		0,
	);

	return (
		<Link href={href} className="group block" aria-label={box.name}>
			<div className="relative aspect-[4/5] overflow-hidden bg-nl-russet/15 mb-4">
				{image ? (
					<Image
						src={image}
						alt={box.name}
						fill
						sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 300px"
						loading="lazy"
						className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
					/>
				) : (
					<div className="absolute inset-0 flex items-center justify-center text-nl-russet/50 text-[10px] tracking-[0.22em] uppercase">
						Gift box
					</div>
				)}

				{occasionName && (
					<div className="absolute top-3 left-3 px-2.5 py-1 bg-nl-linen/90 text-nl-cacao text-[9px] tracking-[0.22em] uppercase">
						{occasionName}
					</div>
				)}

				{box.discount_percentage > 0 && (
					<div className="absolute top-3 right-3 px-2.5 py-1 bg-nl-amber text-nl-espresso text-[9px] tracking-[0.22em] uppercase">
						-{box.discount_percentage}%
					</div>
				)}
			</div>

			<h3 className="font-serif text-lg leading-tight text-nl-cacao line-clamp-2 mb-2 min-h-[44px]">
				{box.name}
			</h3>
			<div className="h-px w-7 bg-nl-amber mb-2.5" />

			<div className="flex items-center justify-between gap-2">
				<span className="font-serif text-xl text-nl-cacao leading-none">
					{formatPrice(price.total, "AED", locale)}
				</span>
				<span className="text-[10px] tracking-[0.18em] uppercase text-nl-russet shrink-0">
					{itemCount} {itemCount === 1 ? "item" : "items"}
				</span>
			</div>
		</Link>
	);
}
