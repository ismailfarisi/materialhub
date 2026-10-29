"use client";

import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useEffect, useState } from "react";
import { ReelFeed } from "../reels/reel-feed";

interface FeedReel {
	id: string;
	creator?: { displayName?: string; avatarUrl?: string } | null;
	thumbnailUrl?: string;
	thumbnail_url?: string;
	videoPlaybackUrl?: string;
	video_playback_url?: string;
}

interface Props {
	reels: FeedReel[];
	/** Category slug so the opened feed continues within this category. */
	categorySlug?: string;
	locale?: string;
}

function getDisplayName(r: FeedReel): string {
	return r.creator?.displayName ?? "Creator";
}

function getAvatar(r: FeedReel): string {
	return r.creator?.avatarUrl ?? r.thumbnailUrl ?? r.thumbnail_url ?? "";
}

export function ListingStoryRail({ reels, categorySlug, locale = "en" }: Props) {
	const tCommon = useTranslations("common");
	const [activeReelId, setActiveReelId] = useState<string | null>(null);
	const [watchedIds, setWatchedIds] = useState<Set<string>>(new Set());

	// Lock body scroll while the fullscreen viewer is open so the page behind it
	// can't scroll (including horizontally on mobile).
	useEffect(() => {
		if (!activeReelId) return;
		const prev = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		return () => {
			document.body.style.overflow = prev;
		};
	}, [activeReelId]);

	if (reels.length === 0) return null;

	function open(reel: FeedReel) {
		setActiveReelId(reel.id);
		setWatchedIds((prev) => new Set([...prev, reel.id]));
	}

	function close() {
		setActiveReelId(null);
	}

	return (
		<section className="py-4">
			<div className="container">
				<div className="flex gap-4 overflow-x-auto scrollbar-hide pb-2">
					{reels.map((r) => {
						const watched = watchedIds.has(r.id);
						const name = getDisplayName(r);
						const src = getAvatar(r);
						return (
							<button
								key={r.id}
								type="button"
								aria-label={`Watch ${name} reel`}
								onClick={() => open(r)}
								className="flex flex-col items-center gap-1.5 shrink-0"
							>
								<div
									className={cn(
										"w-16 h-16 rounded-full p-[2px]",
										watched
											? "bg-border"
											: "bg-gradient-to-br from-copper to-gold",
									)}
								>
									<div className="w-full h-full rounded-full overflow-hidden bg-card p-[2px]">
										<div className="relative w-full h-full rounded-full overflow-hidden">
											{src && (
												<Image
													src={src}
													alt={name}
													fill
													className="object-cover"
												/>
											)}
										</div>
									</div>
								</div>
								<span className="text-xs text-muted-foreground truncate w-16 text-center">
									{name.split(" ")[0]}
								</span>
							</button>
						);
					})}
				</div>
			</div>

			{activeReelId && (
				<div className="fixed inset-0 z-50 bg-black">
					<button
						type="button"
						onClick={close}
						aria-label={tCommon("close")}
						className="absolute top-4 end-4 z-[60] p-2 bg-white/10 backdrop-blur-sm rounded-full text-white"
					>
						<X className="h-5 w-5" />
					</button>
					<ReelFeed
						seedReelId={activeReelId}
						initialContext="category"
						categorySlug={categorySlug}
						locale={locale}
						hideTabSwitcher
					/>
				</div>
			)}
		</section>
	);
}
