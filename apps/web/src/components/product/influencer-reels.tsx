"use client";

import Image from "next/image";
import { useState, useRef } from "react";
import { X, ChevronUp, ChevronDown, ShoppingBag, Play } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { cn, formatCompactNumber } from "@/lib/utils";

interface Reel {
  id: string;
  influencer_name: string;
  influencer_handle: string;
  avatar_url: string;
  follower_count: number;
  is_verified: boolean;
  video_url: string;
  thumbnail_url: string;
  type: "story" | "deep_dive";
  quote?: string;
}

interface InfluencerReelsProps {
  reels: Reel[];
}

function formatFollowers(count: number, locale: string): string {
  return formatCompactNumber(count, locale);
}

function StoryCircle({
  reel,
  onClick,
  watched,
}: {
  reel: Reel;
  onClick: () => void;
  watched: boolean;
}) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1.5 shrink-0">
      <div className="relative">
        <div
          className={cn(
            "w-16 h-16 rounded-full p-[2px]",
            watched
              ? "bg-border"
              : "bg-gradient-to-br from-copper to-gold"
          )}
        >
          <div className="w-full h-full rounded-full overflow-hidden bg-card p-[2px]">
            <div className="relative w-full h-full rounded-full overflow-hidden">
              <Image src={reel.avatar_url} alt={reel.influencer_name} fill className="object-cover" />
            </div>
          </div>
        </div>
        {!watched && (
          <div className="absolute inset-0 rounded-full animate-pulse-ring border-2 border-copper/40" />
        )}
      </div>
      <span className="text-xs text-muted-foreground truncate w-16 text-center">
        {reel.influencer_name.split(" ")[0]}
      </span>
    </button>
  );
}

function FullscreenPlayer({
  reels,
  startIndex,
  onClose,
}: {
  reels: Reel[];
  startIndex: number;
  onClose: () => void;
}) {
  const tCommon = useTranslations("common");
  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const videoRef = useRef<HTMLVideoElement>(null);
  const reel = reels[currentIndex];

  function goNext() {
    if (currentIndex < reels.length - 1) setCurrentIndex(currentIndex + 1);
  }
  function goPrev() {
    if (currentIndex > 0) setCurrentIndex(currentIndex - 1);
  }

  return (
    <div className="fixed inset-0 z-50 bg-warm-dark flex items-center justify-center">
      <button
        onClick={onClose}
        className="absolute top-4 end-4 z-10 p-2 bg-white/10 backdrop-blur-sm rounded-full text-white hover:bg-white/20"
      >
        <X className="h-5 w-5" />
      </button>

      <button
        onClick={goPrev}
        disabled={currentIndex === 0}
        className="absolute start-4 top-1/2 -translate-y-1/2 p-2 bg-white/10 backdrop-blur-sm rounded-full text-white disabled:opacity-30"
      >
        <ChevronUp className="h-5 w-5" />
      </button>
      <button
        onClick={goNext}
        disabled={currentIndex === reels.length - 1}
        className="absolute end-4 top-1/2 -translate-y-1/2 p-2 bg-white/10 backdrop-blur-sm rounded-full text-white disabled:opacity-30"
      >
        <ChevronDown className="h-5 w-5" />
      </button>

      <div className="relative w-full max-w-sm h-[80vh] rounded-2xl overflow-hidden">
        <video
          ref={videoRef}
          key={reel.id}
          src={reel.video_url}
          autoPlay
          loop
          playsInline
          className="w-full h-full object-cover"
        />
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
          <div className="flex items-center gap-2 mb-2">
            <div className="relative w-8 h-8 rounded-full overflow-hidden">
              <Image src={reel.avatar_url} alt={reel.influencer_name} fill className="object-cover" />
            </div>
            <div>
              <p className="text-white text-sm font-medium">{reel.influencer_name}</p>
              <p className="text-white/60 text-xs">@{reel.influencer_handle}</p>
            </div>
          </div>
          <button className="mt-2 flex items-center gap-2 bg-copper text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-copper/90 transition">
            <ShoppingBag className="h-4 w-4" />
            {tCommon("shopThisLook")}
          </button>
        </div>
      </div>
    </div>
  );
}

export function InfluencerReels({ reels }: InfluencerReelsProps) {
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const [watchedIds, setWatchedIds] = useState<Set<string>>(new Set());
  const [playerOpen, setPlayerOpen] = useState(false);
  const [playerStartIndex, setPlayerStartIndex] = useState(0);

  const storyReels = reels.filter((r) => r.type === "story");
  const deepDives = reels.filter((r) => r.type === "deep_dive");

  function openPlayer(index: number) {
    setPlayerStartIndex(index);
    setPlayerOpen(true);
    setWatchedIds((prev) => new Set([...prev, storyReels[index].id]));
  }

  if (reels.length === 0) return null;

  return (
    <section className="py-12 md:py-16">
      <div className="container">
        {storyReels.length > 0 && (
          <div className="mb-10">
            <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-2">
              {storyReels.map((reel, i) => (
                <StoryCircle
                  key={reel.id}
                  reel={reel}
                  onClick={() => openPlayer(i)}
                  watched={watchedIds.has(reel.id)}
                />
              ))}
            </div>
          </div>
        )}

        {deepDives.length > 0 && (
          <div>
            <h3 className="text-lg font-serif font-bold mb-4">{tCommon("expertReviews")}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {deepDives.map((reel) => (
                <div
                  key={reel.id}
                  className="flex gap-4 p-4 rounded-xl bg-warm border border-border hover:shadow-md transition-shadow"
                >
                  <div className="relative w-24 h-32 rounded-lg overflow-hidden shrink-0 bg-warm-dark/10">
                    <Image src={reel.thumbnail_url} alt={reel.influencer_name} fill className="object-cover" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="p-2 bg-warm-dark/60 backdrop-blur-sm rounded-full">
                        <Play className="h-4 w-4 text-white" fill="white" />
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{reel.influencer_name}</span>
                      {reel.is_verified && (
                        <span className="text-xs text-copper">{tCommon("verified")}</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {tCommon("followers", { count: formatCompactNumber(reel.follower_count, locale) })}
                    </p>
                    {reel.quote && (
                      <p className="text-sm text-foreground/80 mt-2 italic line-clamp-2">
                        &ldquo;{reel.quote}&rdquo;
                      </p>
                    )}
                    <button className="text-sm text-copper font-medium mt-2 hover:underline">
                      {tCommon("watchFullReview")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {playerOpen && (
          <FullscreenPlayer
            reels={storyReels}
            startIndex={playerStartIndex}
            onClose={() => setPlayerOpen(false)}
          />
        )}
      </div>
    </section>
  );
}
