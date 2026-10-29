"use client";
import { useState } from "react";
import { toggleFollow } from "@/lib/api/reels";

export function FollowButton({
  userId,
  initiallyFollowing = false,
  disabled = false,
}: {
  userId: string;
  initiallyFollowing?: boolean;
  disabled?: boolean;
}) {
  const [following, setFollowing] = useState(initiallyFollowing);
  const [pending, setPending] = useState(false);

  async function onClick() {
    if (pending || disabled) return;
    setPending(true);
    try {
      const r = await toggleFollow(userId);
      setFollowing(r.action === "followed");
    } catch {
      // swallow — caller can surface error state later
    } finally {
      setPending(false);
    }
  }

  if (disabled) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="uppercase transition-colors disabled:opacity-50"
      style={{
        fontFamily:
          "var(--font-inter-tight), var(--font-dm-sans), 'Inter Tight', system-ui, sans-serif",
        fontSize: 11,
        letterSpacing: "0.22em",
        padding: "13px 30px",
        border: following
          ? "1px solid rgba(44,24,16,0.4)"
          : "1px solid hsl(var(--nl-amber))",
        background: following ? "transparent" : "hsl(var(--nl-amber))",
        color: following ? "hsl(var(--nl-cacao))" : "hsl(var(--nl-espresso))",
      }}
    >
      {following ? "Following" : "Follow"}
    </button>
  );
}
