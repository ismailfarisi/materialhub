"use client";

import { useRef, useState } from "react";
import Link from "next/link";

/**
 * Derives a Cloudflare Stream animated thumbnail URL from a static thumbnail.
 * Produces a short looping WebP preview (4s starting at 2s into the video).
 */
function toAnimatedThumbnail(thumbnailUrl: string): string | null {
  try {
    const url = new URL(thumbnailUrl);
    if (!url.hostname.includes("cloudflarestream.com")) return null;
    // Replace /thumbnails/thumbnail.jpg with animated gif params
    const base = thumbnailUrl.replace(/\/thumbnails\/thumbnail\.\w+$/, "");
    return `${base}/thumbnails/thumbnail.gif?time=2s&duration=4s&height=480`;
  } catch {
    return null;
  }
}

export function ReelThumbnail({
  reelId,
  thumbnailUrl,
  viewCount,
  locale,
  playbackUrl,
}: {
  reelId: string;
  thumbnailUrl: string;
  viewCount: number;
  locale: string;
  /** HLS playback URL — if provided, enables hover-to-play */
  playbackUrl?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hovering, setHovering] = useState(false);
  const [videoLoaded, setVideoLoaded] = useState(false);

  const animatedSrc = toAnimatedThumbnail(thumbnailUrl);

  function handleMouseEnter() {
    setHovering(true);
    if (playbackUrl && videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {});
    }
  }

  function handleMouseLeave() {
    setHovering(false);
    if (videoRef.current) {
      videoRef.current.pause();
    }
  }

  return (
    <Link
      href={`/${locale}/reels/${reelId}`}
      className="block w-32 flex-shrink-0 group"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div
        className="relative aspect-[9/16] overflow-hidden"
        style={{ background: "rgba(44,24,16,0.06)" }}
      >
        {/* Layer 1: Static or animated thumbnail (always visible as base) */}
        <img
          src={animatedSrc || thumbnailUrl}
          alt=""
          className="w-full h-full object-cover"
        />

        {/* Layer 2: Video on hover (loads lazily, overlays the thumbnail) */}
        {playbackUrl && (
          <video
            ref={videoRef}
            src={playbackUrl}
            muted
            loop
            playsInline
            preload="none"
            onLoadedData={() => setVideoLoaded(true)}
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
              hovering && videoLoaded ? "opacity-100" : "opacity-0"
            }`}
          />
        )}

        {/* Play icon — fades out on hover when video is playing */}
        <div
          className={`absolute inset-0 flex items-center justify-center transition-opacity duration-300 ${
            hovering && videoLoaded ? "opacity-0" : "opacity-100"
          }`}
        >
          <div className="w-8 h-8 rounded-full bg-[#1A1208]/55 flex items-center justify-center backdrop-blur-sm">
            <svg className="w-3.5 h-3.5 text-white ml-0.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>

        {/* View count badge */}
        <span className="absolute bottom-1 right-1 bg-[#1A1208]/65 text-white text-xs px-1.5 py-0.5">
          ▶ {viewCount}
        </span>
      </div>
    </Link>
  );
}
