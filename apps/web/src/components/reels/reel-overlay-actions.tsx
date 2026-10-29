"use client";

import { Bookmark, Check, Heart, Plus, Send, User } from "lucide-react";
import { useState } from "react";
import {
  recordShare,
  toggleFollow,
  toggleLike,
  toggleSave,
} from "@/lib/api/reels";

interface OverlayState {
  liked: boolean;
  saved: boolean;
  following: boolean;
  likeCount: number;
  saveCount: number;
  shareCount: number;
}

interface Props {
  reelId: string;
  creatorId: string;
  initialState: OverlayState;
}

function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1)}K`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

function ActionButton({
  onClick,
  ariaLabel,
  active = false,
  count,
  children,
}: {
  onClick: () => void;
  ariaLabel: string;
  active?: boolean;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={active}
      className="group flex flex-col items-center gap-1 select-none"
    >
      <span
        className={`flex h-12 w-12 items-center justify-center rounded-full bg-black/60 backdrop-blur-sm shadow-lg ring-1 ring-white/10 transition-transform group-active:scale-90 ${
          active ? "text-primary" : "text-white"
        }`}
      >
        {children}
      </span>
      {count != null && (
        <span className="text-xs font-medium text-white drop-shadow">
          {formatCount(count)}
        </span>
      )}
    </button>
  );
}

export function ReelOverlayActions({ reelId, creatorId, initialState }: Props) {
  const [s, setS] = useState<OverlayState>(initialState);

  async function onLike() {
    try {
      const result = await toggleLike(reelId);
      setS((prev) => ({
        ...prev,
        liked: result.action === "liked",
        likeCount: prev.likeCount + (result.action === "liked" ? 1 : -1),
      }));
    } catch {
      // swallow
    }
  }

  async function onSave() {
    try {
      const result = await toggleSave(reelId);
      setS((prev) => ({
        ...prev,
        saved: result.action === "saved",
        saveCount: prev.saveCount + (result.action === "saved" ? 1 : -1),
      }));
    } catch {
      // swallow
    }
  }

  async function onShare() {
    try {
      const result = await recordShare(reelId);
      if (typeof navigator !== "undefined" && navigator.share) {
        navigator.share({ url: result.shareableUrl }).catch(() => {});
      } else if (typeof navigator !== "undefined" && navigator.clipboard) {
        navigator.clipboard.writeText(result.shareableUrl).catch(() => {});
      }
      setS((prev) => ({ ...prev, shareCount: result.shareCount }));
    } catch {
      // swallow
    }
  }

  async function onFollow() {
    try {
      const result = await toggleFollow(creatorId);
      setS((prev) => ({ ...prev, following: result.action === "followed" }));
    } catch {
      // swallow
    }
  }

  return (
    <div className="absolute right-3 bottom-24 z-20 flex flex-col items-center gap-5">
      <button
        type="button"
        onClick={onFollow}
        aria-label={s.following ? "Unfollow" : "Follow"}
        aria-pressed={s.following}
        className="group relative flex flex-col items-center"
      >
        <span className="relative flex h-12 w-12 items-center justify-center rounded-full bg-white text-gray-800 ring-2 ring-white shadow-lg transition-transform group-active:scale-90">
          <User className="h-6 w-6" strokeWidth={2} />
          <span
            className={`absolute -bottom-1.5 left-1/2 -translate-x-1/2 flex h-5 w-5 items-center justify-center rounded-full text-primary-foreground shadow-md transition-colors ${
              s.following ? "bg-emerald-500" : "bg-primary"
            }`}
          >
            {s.following ? (
              <Check className="h-3 w-3" strokeWidth={3} />
            ) : (
              <Plus className="h-3 w-3" strokeWidth={3} />
            )}
          </span>
        </span>
      </button>
      <ActionButton
        onClick={onLike}
        ariaLabel={s.liked ? "Unlike" : "Like"}
        active={s.liked}
        count={s.likeCount}
      >
        <Heart
          className="h-6 w-6"
          strokeWidth={2}
          fill={s.liked ? "currentColor" : "none"}
        />
      </ActionButton>
      <ActionButton
        onClick={onSave}
        ariaLabel={s.saved ? "Unsave" : "Save"}
        active={s.saved}
        count={s.saveCount}
      >
        <Bookmark
          className="h-6 w-6"
          strokeWidth={2}
          fill={s.saved ? "currentColor" : "none"}
        />
      </ActionButton>
      <ActionButton onClick={onShare} ariaLabel="Share" count={s.shareCount}>
        <Send className="h-6 w-6" strokeWidth={2} />
      </ActionButton>
    </div>
  );
}
