import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { AddGiftBoxToCart } from "@/components/gifts/AddGiftBoxToCart";
import { apiServer } from "@/lib/api-server";
import type { GiftBoxDetail } from "@/lib/api/gifts";
import { formatPrice } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface Props {
	params: Promise<{ locale: string; slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { slug } = await params;
	const server = await apiServer();
	try {
		const { data } = await server.get(`/gift/boxes/${slug}`);
		const { box } = data.data as GiftBoxDetail;
		return {
			title: `${box.name} — MaterialHub Gifts`,
			description: box.description?.slice(0, 160) || undefined,
			openGraph: {
				title: box.name,
				images: box.hero_image_url ? [box.hero_image_url] : [],
			},
		};
	} catch {
		return { title: "Gift box" };
	}
}

export default async function GiftBoxDetailPage({ params }: Props) {
	const { locale, slug } = await params;
	setRequestLocale(locale);

	const server = await apiServer();

	const detail = (await server
		.get(`/gift/boxes/${slug}`)
		.then((r) => r.data.data as GiftBoxDetail)
		.catch(() => null)) as GiftBoxDetail | null;

	if (!detail) notFound();

	const { box, price } = detail;

	// Build the gallery: hero first, then any style images (de-duplicated).
	const gallery = Array.from(
		new Set(
			[box.hero_image_url, ...(box.style?.images ?? [])].filter(
				(u): u is string => !!u,
			),
		),
	);

	const totalItems = (box.items || []).reduce(
		(sum, it) => sum + (it.quantity || 0),
		0,
	);

	return (
		<div className="mx-auto max-w-[1400px] px-4 py-10 md:px-8 md:py-14">
			<nav className="mb-6 text-[11px] tracking-[0.16em] uppercase text-nl-russet">
				<Link href={`/${locale}/gifts`} className="hover:text-nl-amber">
					Gifts
				</Link>
				<span className="mx-2">/</span>
				<span className="text-nl-cacao">{box.name}</span>
			</nav>

			<div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
				{/* Gallery */}
				<div className="space-y-4">
					<div className="relative aspect-square overflow-hidden bg-nl-russet/15">
						{gallery[0] ? (
							<Image
								src={gallery[0]}
								alt={box.name}
								fill
								priority
								sizes="(max-width: 1024px) 100vw, 600px"
								className="object-cover"
							/>
						) : (
							<div className="absolute inset-0 flex items-center justify-center font-serif text-3xl text-nl-russet/40">
								{box.name.charAt(0)}
							</div>
						)}
					</div>
					{gallery.length > 1 && (
						<div className="grid grid-cols-4 gap-3">
							{gallery.slice(1, 5).map((url) => (
								<div
									key={url}
									className="relative aspect-square overflow-hidden bg-nl-russet/15"
								>
									<Image
										src={url}
										alt={box.name}
										fill
										sizes="150px"
										className="object-cover"
									/>
								</div>
							))}
						</div>
					)}
				</div>

				{/* Details */}
				<div className="space-y-6">
					<div>
						<h1 className="font-serif text-3xl md:text-4xl text-nl-cacao mb-3">
							{box.name}
						</h1>
						{box.description && (
							<p className="text-nl-russet leading-relaxed">
								{box.description}
							</p>
						)}
					</div>

					{/* Price breakdown */}
					<div className="rounded-xl border border-nl-russet/20 bg-white/60 p-5">
						<dl className="space-y-2 text-sm">
							<div className="flex items-center justify-between">
								<dt className="text-nl-russet">Items subtotal</dt>
								<dd className="text-nl-cacao">
									{formatPrice(price.itemsSubtotal, "AED", locale)}
								</dd>
							</div>
							{price.discount > 0 && (
								<div className="flex items-center justify-between">
									<dt className="text-nl-russet">
										Bundle discount
										{box.discount_percentage > 0
											? ` (-${box.discount_percentage}%)`
											: ""}
									</dt>
									<dd className="text-nl-amber">
										−{formatPrice(price.discount, "AED", locale)}
									</dd>
								</div>
							)}
							<div className="flex items-center justify-between">
								<dt className="text-nl-russet">Packaging</dt>
								<dd className="text-nl-cacao">
									{formatPrice(price.packaging, "AED", locale)}
								</dd>
							</div>
							<div className="mt-2 flex items-center justify-between border-t border-nl-russet/20 pt-3">
								<dt className="font-medium text-nl-cacao">Total</dt>
								<dd className="font-serif text-2xl text-nl-cacao">
									{formatPrice(price.total, "AED", locale)}
								</dd>
							</div>
						</dl>
					</div>

					{/* Contents — product names aren't in the payload, so we show the
					    quantity breakdown honestly rather than fabricating names. */}
					<div>
						<h2 className="text-[11px] tracking-[0.2em] uppercase text-nl-russet mb-3">
							What&rsquo;s inside
						</h2>
						<p className="text-sm text-nl-cacao mb-3">
							{totalItems} {totalItems === 1 ? "item" : "items"} across{" "}
							{box.items.length}{" "}
							{box.items.length === 1 ? "product" : "products"}, curated and
							packaged together.
						</p>
						<ul className="space-y-1.5 text-sm text-nl-russet">
							{box.items.map((it, idx) => (
								<li
									key={`${it.product_id}-${it.variant_id ?? "base"}`}
									className="flex items-center justify-between border-b border-nl-russet/10 pb-1.5"
								>
									<span>Item {idx + 1}</span>
									<span className="text-nl-cacao">×{it.quantity}</span>
								</li>
							))}
						</ul>
					</div>

					{/* Style / packaging spec */}
					{box.style && (
						<div className="text-sm text-nl-russet">
							<h2 className="text-[11px] tracking-[0.2em] uppercase text-nl-russet mb-2">
								Packaging
							</h2>
							<p>
								{box.style.name}
								{box.style.dimensions ? ` · ${box.style.dimensions}` : ""}
								{box.style.max_capacity
									? ` · holds up to ${box.style.max_capacity} items`
									: ""}
							</p>
						</div>
					)}

					{/* Add to cart */}
					<div className="border-t border-nl-russet/20 pt-6">
						<AddGiftBoxToCart giftBoxId={box.id} />
					</div>
				</div>
			</div>
		</div>
	);
}
