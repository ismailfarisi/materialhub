"use client";

import type { ProductReel } from "@/lib/queries/product-reels";
import { formatPrice } from "@/lib/utils";
import { Play } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

interface ReelProductCardProps {
	reel: ProductReel;
	locale: string;
}

const TYPE_PILL: Record<ProductReel["author_kind"], string> = {
	creator: "Creator",
	customer: "Buyer",
	house: "House",
};

function formatDuration(seconds: number): string {
	const m = Math.floor(seconds / 60);
	const s = Math.round(seconds % 60);
	return `${m}:${String(s).padStart(2, "0")}`;
}

function formatCount(n: number): string {
	if (n < 1000) return String(n);
	if (n < 10_000) return `${(n / 1000).toFixed(1)}K`;
	if (n < 1_000_000) return `${Math.round(n / 1000)}K`;
	return `${(n / 1_000_000).toFixed(1)}M`;
}

export function ReelProductCard({ reel, locale }: ReelProductCardProps) {
	const cardRef = useRef<HTMLAnchorElement>(null);
	const videoRef = useRef<HTMLVideoElement>(null);
	const [inView, setInView] = useState(false);

	useEffect(() => {
		const el = cardRef.current;
		if (!el) return;
		const observer = new IntersectionObserver(
			([entry]) => setInView(entry.intersectionRatio > 0.3),
			{ threshold: [0.3] },
		);
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		const v = videoRef.current;
		if (!v) return;
		if (inView) v.play().catch(() => {});
		else v.pause();
	}, [inView]);

	const firstTag = (reel.tags ?? []).find((t) => t.product?.id);
	const product = firstTag?.product;
	const image = product?.primary_image_url;

	return (
		<Link
			ref={cardRef}
			href={`/${locale}/reels/${reel.id}`}
			aria-label={`Open reel${product ? ` featuring ${product.name}` : ""}`}
			className="relative block w-[232px] flex-shrink-0 aspect-[9/16] overflow-hidden bg-nl-russet/40 transition-transform duration-300 hover:-translate-y-1 group"
			style={{ scrollSnapAlign: "start" }}
		>
			{reel.video_playback_url ? (
				<video
					ref={videoRef}
					src={reel.video_playback_url}
					poster={reel.thumbnail_url || undefined}
					muted
					loop
					playsInline
					preload="metadata"
					className="absolute inset-0 w-full h-full object-cover"
				>
					<track kind="captions" />
				</video>
			) : null}

			{/* Top + bottom legibility gradients */}
			<div
				aria-hidden="true"
				className="absolute inset-0 bg-gradient-to-b from-nl-espresso/45 via-transparent via-55% to-nl-espresso/85"
			/>

			{/* type pill + view count + duration */}
			<div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-1.5">
				<span className="px-2 py-0.5 bg-nl-linen/90 text-nl-cacao text-[8.5px] tracking-[0.22em] uppercase">
					{TYPE_PILL[reel.author_kind]}
				</span>
				<div className="flex items-center gap-1.5">
					<span className="px-2 py-0.5 bg-nl-espresso/55 text-nl-linen text-[10px] backdrop-blur-sm flex items-center gap-1 tabular-nums">
						<Play className="w-2.5 h-2.5 fill-current" />
						{formatCount(reel.view_count ?? 0)}
					</span>
					<span className="px-2 py-0.5 bg-nl-espresso/55 text-nl-linen text-[10px] backdrop-blur-sm tabular-nums">
						{formatDuration(reel.video_duration_seconds)}
					</span>
				</div>
			</div>

			{/* play affordance — hidden once the preview is animating */}
			<span
				aria-hidden="true"
				className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[52px] h-[52px] rounded-full border border-nl-linen/85 bg-nl-espresso/25 backdrop-blur-sm flex items-center justify-center opacity-80 transition-opacity duration-300 group-hover:opacity-0"
			>
				<Play className="w-5 h-5 text-nl-linen ml-0.5" />
			</span>

			{/* Bottom: tagged product chip (replaces caption + author from PDP variant) */}
			{product ? (
				<div className="absolute left-3 right-3 bottom-3 bg-nl-linen text-nl-cacao p-2 flex items-center gap-2.5">
					<div className="relative w-9 h-11 flex-shrink-0 overflow-hidden bg-nl-russet/30">
						{image ? (
							<Image
								src={image}
								alt=""
								fill
								sizes="36px"
								className="object-cover"
							/>
						) : null}
					</div>
					<div className="min-w-0 flex-1">
						<div className="font-serif text-[12px] leading-tight truncate">
							{product.name}
						</div>
						<div className="text-[10px] text-nl-russet mt-0.5 tabular-nums">
							{formatPrice(product.price, "AED")}
						</div>
					</div>
				</div>
			) : null}
		</Link>
	);
}
