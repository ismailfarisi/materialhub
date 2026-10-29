"use client";

import Image from "next/image";
import { useState, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import useEmblaCarousel from "embla-carousel-react";
import { Play, Volume2, VolumeX, Maximize2, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface MediaItem {
  id: string;
  url: string;
  alt_text?: string;
  type: "image" | "video" | "spin";
  is_lifestyle?: boolean;
}

interface MediaGalleryProps {
  images: Array<{ id: string; url: string; alt_text?: string }>;
  video_url?: string;
  spin_images?: string[];
  lifestyle_images?: Array<{ id: string; url: string; alt_text?: string }>;
}

export function MediaGallery({
  images,
  video_url,
  spin_images,
  lifestyle_images,
}: MediaGalleryProps) {
  const t = useTranslations("product");
  const tCommon = useTranslations("common");
  const [activeTab, setActiveTab] = useState<"studio" | "lifestyle">("studio");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isZoomed, setIsZoomed] = useState(false);
  const [zoomPos, setZoomPos] = useState({ x: 50, y: 50 });
  const [isMuted, setIsMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: "start",
    containScroll: "trimSnaps",
  });

  // Build media items list
  const mediaItems: MediaItem[] = [];
  if (video_url) {
    mediaItems.push({ id: "video-hero", url: video_url, type: "video" });
  }
  if (spin_images && spin_images.length > 0) {
    mediaItems.push({ id: "spin-360", url: spin_images[0], type: "spin" });
  }
  const studioImages = images.map((img) => ({
    ...img,
    type: "image" as const,
    is_lifestyle: false,
  }));
  const lifestyleImgs = (lifestyle_images || []).map((img) => ({
    ...img,
    type: "image" as const,
    is_lifestyle: true,
  }));

  const displayImages = activeTab === "studio" ? studioImages : lifestyleImgs;
  const allMedia = [...mediaItems, ...displayImages];
  const currentItem = allMedia[selectedIndex] || allMedia[0];

  if (!currentItem) return null;

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setZoomPos({ x, y });
  }

  function handleThumbnailClick(index: number) {
    setSelectedIndex(index);
    setIsZoomed(false);
  }

  const hasLifestyle = lifestyleImgs.length > 0;

  return (
    <div className="space-y-3">
      {/* Main media area */}
      <div className="relative aspect-square overflow-hidden rounded-xl bg-warm">
        {currentItem.type === "video" ? (
          <div className="relative w-full h-full">
            <video
              ref={videoRef}
              src={currentItem.url}
              autoPlay
              loop
              muted={isMuted}
              playsInline
              className="w-full h-full object-cover"
            />
            <div className="absolute bottom-4 end-4 flex gap-2">
              <button
                onClick={() => setIsMuted(!isMuted)}
                className="p-2 bg-warm-dark/60 backdrop-blur-sm rounded-full text-white hover:bg-warm-dark/80 transition"
              >
                {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
              <button
                onClick={() => videoRef.current?.requestFullscreen()}
                className="p-2 bg-warm-dark/60 backdrop-blur-sm rounded-full text-white hover:bg-warm-dark/80 transition"
              >
                <Maximize2 className="h-4 w-4" />
              </button>
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-warm-dark/30 to-transparent pointer-events-none" />
          </div>
        ) : currentItem.type === "spin" ? (
          <div className="relative w-full h-full flex items-center justify-center">
            <Image src={currentItem.url} alt="360 view" fill className="object-cover" />
            <div className="absolute inset-0 flex items-center justify-center bg-warm-dark/10">
              <div className="flex flex-col items-center gap-2 text-foreground/70">
                <RotateCw className="h-8 w-8 animate-float" />
                <span className="text-sm font-medium">{tCommon("dragToExplore")}</span>
              </div>
            </div>
          </div>
        ) : (
          <div
            className="relative w-full h-full cursor-zoom-in"
            onMouseEnter={() => setIsZoomed(true)}
            onMouseLeave={() => setIsZoomed(false)}
            onMouseMove={handleMouseMove}
          >
            <Image
              src={currentItem.url}
              alt={currentItem.alt_text || ""}
              fill
              className="object-cover transition-transform duration-200"
              style={
                isZoomed
                  ? {
                      transform: "scale(2.5)",
                      transformOrigin: `${zoomPos.x}% ${zoomPos.y}%`,
                    }
                  : undefined
              }
              priority
            />
          </div>
        )}
      </div>

      {/* Studio / Lifestyle toggle */}
      {hasLifestyle && (
        <div className="flex gap-1 p-1 bg-warm rounded-full w-fit mx-auto">
          <button
            onClick={() => { setActiveTab("studio"); setSelectedIndex(mediaItems.length > 0 ? mediaItems.length : 0); }}
            className={cn(
              "px-4 py-1.5 rounded-full text-sm font-medium transition-all",
              activeTab === "studio"
                ? "bg-copper text-white shadow-sm"
                : "text-foreground/60 hover:text-foreground"
            )}
          >
            {t("studio")}
          </button>
          <button
            onClick={() => { setActiveTab("lifestyle"); setSelectedIndex(mediaItems.length > 0 ? mediaItems.length : 0); }}
            className={cn(
              "px-4 py-1.5 rounded-full text-sm font-medium transition-all",
              activeTab === "lifestyle"
                ? "bg-copper text-white shadow-sm"
                : "text-foreground/60 hover:text-foreground"
            )}
          >
            {t("lifestyle")}
          </button>
        </div>
      )}

      {/* Thumbnail carousel */}
      <div className="overflow-hidden min-w-0 w-full" ref={emblaRef}>
        <div className="flex gap-2">
          {allMedia.map((item, i) => (
            <button
              key={item.id}
              onClick={() => handleThumbnailClick(i)}
              className={cn(
                "relative h-16 w-16 rounded-lg overflow-hidden shrink-0 border-2 transition-all",
                i === selectedIndex
                  ? "border-copper ring-2 ring-copper/30"
                  : "border-transparent hover:border-border-warm"
              )}
            >
              {item.type === "video" ? (
                <div className="w-full h-full bg-warm-dark/20 flex items-center justify-center">
                  <Play className="h-4 w-4 text-copper" fill="currentColor" />
                </div>
              ) : item.type === "spin" ? (
                <div className="w-full h-full bg-warm flex items-center justify-center">
                  <RotateCw className="h-4 w-4 text-copper" />
                </div>
              ) : (
                <Image src={item.url} alt={item.alt_text || ""} fill className="object-cover" />
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
