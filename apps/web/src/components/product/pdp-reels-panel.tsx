"use client";

import { ProductDrawer } from "@/components/reels/product-drawer";
import { ReelOverlayActions } from "@/components/reels/reel-overlay-actions";
import { ReelPlayer, type ReelTag } from "@/components/reels/reel-player";
import { recordView } from "@/lib/api/reels";
import type { ProductReel } from "@/lib/queries/product-reels";
import { X } from "lucide-react";
import { useLocale } from "next-intl";
import { useEffect, useRef, useState } from "react";

interface DrawerProduct {
	id: string;
	slug?: string;
	name: string;
	priceFils: number;
	imageUrl: string;
	inStock?: boolean;
}

interface PdpReelsPanelProps {
	reels: ProductReel[];
	index: number;
	onClose: () => void;
	onChange: (idx: number) => void;
}

function mapTags(reel: ProductReel): ReelTag[] {
	return (reel.tags ?? []).map((t) => ({
		id: t.id,
		timestampSeconds: Number(t.timestamp_seconds ?? 0),
		display_x: null,
		display_y: null,
		product: t.product
			? {
					id: t.product.id,
					slug: t.product.slug,
					name: t.product.name,
					priceFils: Number(t.product.price ?? 0),
					imageUrl: t.product.images?.[0]?.url ?? "",
				}
			: {
					id: t.product_id,
					name: "Product",
					priceFils: 0,
					imageUrl: "",
				},
	}));
}

export function PdpReelsPanel({
	reels,
	index,
	onClose,
	onChange,
}: PdpReelsPanelProps) {
	const locale = useLocale();
	const containerRef = useRef<HTMLDivElement>(null);
	const viewedRef = useRef<Set<string>>(new Set());
	const [drawerProduct, setDrawerProduct] = useState<DrawerProduct | null>(
		null,
	);

	useEffect(() => {
		const prev = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		return () => {
			document.body.style.overflow = prev;
		};
	}, []);

	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [onClose]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: only scroll on mount to the entry index
	useEffect(() => {
		const root = containerRef.current;
		if (!root) return;
		const target = root.querySelector(
			`[data-pdp-reel-index="${index}"]`,
		) as HTMLElement | null;
		if (target) target.scrollIntoView({ block: "start" });
	}, []);

	useEffect(() => {
		const root = containerRef.current;
		if (!root) return;
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					const section = entry.target as HTMLElement;
					const video = section.querySelector("video");
					if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
						video?.play().catch(() => {});
						const idx = Number(section.dataset.pdpReelIndex ?? "-1");
						if (idx >= 0 && idx !== index) onChange(idx);
						const reel = reels[idx];
						if (reel && !viewedRef.current.has(reel.id)) {
							viewedRef.current.add(reel.id);
							const duration = Number(reel.video_duration_seconds ?? 0);
							recordView(reel.id, {
								watchDurationSeconds: duration * 0.6,
								completionPercentage: 0.6,
								deviceType:
									typeof window !== "undefined" && window.innerWidth < 768
										? "web_mobile"
										: "web_desktop",
							}).catch(() => {});
						}
					} else {
						video?.pause();
					}
				}
			},
			{ threshold: [0.6], root },
		);
		for (const el of root.querySelectorAll("[data-pdp-reel-index]")) {
			observer.observe(el);
		}
		return () => observer.disconnect();
	}, [reels, index, onChange]);

	return (
		<>
			<div
				className="fixed inset-0 bg-black/50 z-40 animate-in fade-in"
				onClick={onClose}
				onKeyDown={(e) => {
					if (e.key === "Escape") onClose();
				}}
				role="presentation"
			/>
			{/* biome-ignore lint/a11y/useSemanticElements: native <dialog> conflicts with the fixed-positioned slide-over layout */}
			<div
				role="dialog"
				aria-modal="true"
				aria-label="Reel viewer"
				className="fixed inset-y-0 left-0 w-full max-w-md lg:w-auto lg:max-w-none lg:aspect-[9/16] bg-black shadow-2xl z-50 flex flex-col animate-in slide-in-from-left"
			>
				<button
					type="button"
					onClick={onClose}
					aria-label="Close reel viewer"
					className="absolute top-3 right-3 z-30 w-10 h-10 rounded-full bg-black/60 backdrop-blur text-white flex items-center justify-center hover:bg-black/80"
				>
					<X className="w-4 h-4" />
				</button>

				<div
					ref={containerRef}
					className="flex-1 overflow-y-scroll snap-y snap-mandatory scrollbar-hide"
				>
					{reels.map((r, i) => (
						<section
							key={r.id}
							data-pdp-reel-index={i}
							className="h-full min-h-full w-full snap-start relative"
						>
							<ReelPlayer
								reelId={r.id}
								playbackUrl={r.video_playback_url}
								thumbnailUrl={r.thumbnail_url}
								tags={mapTags(r)}
								onTagTap={(t) => setDrawerProduct(t.product)}
							/>
							<ReelOverlayActions
								reelId={r.id}
								creatorId={r.user_id}
								initialState={{
									liked: false,
									saved: false,
									following: false,
									likeCount: r.like_count ?? 0,
									saveCount: r.save_count ?? 0,
									shareCount: r.share_count ?? 0,
								}}
							/>
						</section>
					))}
				</div>

				<ProductDrawer
					product={drawerProduct}
					open={!!drawerProduct}
					onClose={() => setDrawerProduct(null)}
					locale={locale}
				/>
			</div>
		</>
	);
}
