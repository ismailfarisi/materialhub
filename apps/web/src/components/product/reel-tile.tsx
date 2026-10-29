"use client";

import type { ProductReel } from "@/lib/queries/product-reels";
import { BadgeCheck, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface ReelTileProps {
	reel: ProductReel;
	onClick: () => void;
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

export function ReelTile({ reel, onClick }: ReelTileProps) {
	const author = reel.user;
	const initial =
		(author?.name ?? author?.handle ?? "?").trim().charAt(0).toUpperCase() ||
		"?";
	const tileRef = useRef<HTMLButtonElement>(null);
	const videoRef = useRef<HTMLVideoElement>(null);
	const [inView, setInView] = useState(false);

	useEffect(() => {
		const el = tileRef.current;
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

	return (
		<button
			ref={tileRef}
			type="button"
			onClick={onClick}
			aria-label={`Open reel by ${author?.name ?? author?.handle ?? "user"}`}
			className="relative w-[232px] flex-shrink-0 aspect-[9/16] overflow-hidden bg-nl-russet/40 transition-transform duration-300 hover:-translate-y-1 group"
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
				<span className="flex items-center gap-1.5">
					{reel.featured && (
						<span className="px-2 py-0.5 bg-nl-amber text-nl-espresso text-[8.5px] tracking-[0.22em] uppercase font-medium">
							Featured
						</span>
					)}
					<span className="px-2 py-0.5 bg-nl-linen/90 text-nl-cacao text-[8.5px] tracking-[0.22em] uppercase">
						{TYPE_PILL[reel.author_kind]}
					</span>
				</span>
				<div className="flex items-center gap-1.5">
					<span className="px-2 py-0.5 bg-nl-espresso/55 text-nl-linen text-[10px] backdrop-blur-sm flex items-center gap-1 tabular-nums">
						<Play className="w-2.5 h-2.5 fill-current" />
						{formatCount(reel.view_count)}
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

			{/* caption + author */}
			<div className="absolute left-3.5 right-3.5 bottom-3.5 text-nl-linen text-left">
				<p
					className="font-serif italic text-sm leading-snug mb-2.5 overflow-hidden"
					style={{
						display: "-webkit-box",
						WebkitLineClamp: 2,
						WebkitBoxOrient: "vertical",
					}}
				>
					{reel.caption}
				</p>
				<div className="flex items-center gap-2 text-[10px]">
					<span className="w-[22px] h-[22px] rounded-full bg-nl-linen/95 text-nl-cacao font-serif text-[11px] flex items-center justify-center">
						{initial}
					</span>
					<span className="opacity-90">@{author?.handle ?? "user"}</span>
					{reel.is_verified_buyer && (
						<BadgeCheck
							className="w-3 h-3 text-nl-amber"
							aria-label="Verified buyer"
						/>
					)}
				</div>
			</div>
		</button>
	);
}
