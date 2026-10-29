"use client";

import Image from "next/image";
import { useState } from "react";
import { X, Play, BadgeCheck, Camera, Video, ThumbsUp, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface VisualReview {
  id: string;
  user_name: string;
  rating: number;
  quote: string;
  body?: string;
  photos?: string[];
  video_url?: string;
  is_verified: boolean;
  helpful_count?: number;
  created_at?: string;
}

type FilterType = "all" | "photos" | "videos" | "helpful" | "recent";

interface PhotoVideoReviewsProps {
  reviews: VisualReview[];
}

export function PhotoVideoReviews({ reviews }: PhotoVideoReviewsProps) {
  const [filter, setFilter] = useState<FilterType>("all");
  const [lightboxReview, setLightboxReview] = useState<VisualReview | null>(null);

  const visualReviews = reviews.filter((r) => (r.photos && r.photos.length > 0) || r.video_url);

  const filtered = (() => {
    switch (filter) {
      case "photos":
        return visualReviews.filter((r) => r.photos && r.photos.length > 0);
      case "videos":
        return visualReviews.filter((r) => r.video_url);
      case "helpful":
        return [...visualReviews].sort((a, b) => (b.helpful_count || 0) - (a.helpful_count || 0));
      case "recent":
        return [...visualReviews].sort((a, b) =>
          (b.created_at || "").localeCompare(a.created_at || "")
        );
      default:
        return visualReviews;
    }
  })();

  const filters: { key: FilterType; label: string; icon: any }[] = [
    { key: "all", label: "All", icon: null },
    { key: "photos", label: "With Photos", icon: Camera },
    { key: "videos", label: "With Video", icon: Video },
    { key: "helpful", label: "Most Helpful", icon: ThumbsUp },
    { key: "recent", label: "Recent", icon: Clock },
  ];

  if (visualReviews.length === 0) return null;

  return (
    <div className="space-y-6">
      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm whitespace-nowrap border transition",
              filter === f.key
                ? "bg-copper text-white border-copper"
                : "bg-card text-muted-foreground border-border hover:border-copper/50"
            )}
          >
            {f.icon && <f.icon className="h-3.5 w-3.5" />}
            {f.label}
          </button>
        ))}
      </div>

      <div className="columns-2 md:columns-3 lg:columns-4 gap-3 space-y-3">
        {filtered.map((review) => {
          const mediaUrl = review.video_url || review.photos?.[0];
          if (!mediaUrl) return null;
          return (
            <button
              key={review.id}
              onClick={() => setLightboxReview(review)}
              className="block w-full rounded-xl overflow-hidden bg-warm border border-border hover:shadow-md transition-shadow break-inside-avoid"
            >
              <div className="relative aspect-[3/4]">
                <Image
                  src={review.video_url ? review.photos?.[0] || mediaUrl : mediaUrl}
                  alt={`Review by ${review.user_name}`}
                  fill
                  className="object-cover"
                />
                {review.video_url && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="p-2.5 bg-warm-dark/60 backdrop-blur-sm rounded-full">
                      <Play className="h-4 w-4 text-white" fill="white" />
                    </div>
                  </div>
                )}
              </div>
              <div className="p-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium">{review.user_name}</span>
                  {review.is_verified && (
                    <BadgeCheck className="h-3 w-3 text-copper" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  &ldquo;{review.quote}&rdquo;
                </p>
              </div>
            </button>
          );
        })}
      </div>

      <div className="text-center">
        <button className="bg-copper text-white px-6 py-3 rounded-full font-medium hover:bg-copper/90 transition">
          Write a Review
        </button>
      </div>

      {lightboxReview && (
        <div className="fixed inset-0 z-50 bg-warm-dark/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-end p-3">
              <button
                onClick={() => setLightboxReview(null)}
                className="p-1.5 hover:bg-warm rounded-full transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-5 pb-5">
              {lightboxReview.photos && lightboxReview.photos[0] && (
                <div className="relative aspect-square rounded-xl overflow-hidden mb-4">
                  <Image
                    src={lightboxReview.photos[0]}
                    alt={`Review by ${lightboxReview.user_name}`}
                    fill
                    className="object-cover"
                  />
                </div>
              )}
              <div className="flex items-center gap-2 mb-2">
                <span className="font-medium">{lightboxReview.user_name}</span>
                {lightboxReview.is_verified && (
                  <span className="text-xs text-copper flex items-center gap-1">
                    <BadgeCheck className="h-3.5 w-3.5" /> Verified Purchase
                  </span>
                )}
              </div>
              <div className="flex gap-0.5 mb-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      "w-2 h-2 rounded-full",
                      i < lightboxReview.rating ? "bg-copper" : "bg-border"
                    )}
                  />
                ))}
              </div>
              <p className="text-sm text-foreground">{lightboxReview.body || lightboxReview.quote}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
