"use client";

import { Star, BadgeCheck } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  useFollowState,
  useFollowVendor,
  useUnfollowVendor,
} from "@/lib/queries/vendor-follow";

export type SellerBlockData = {
  id: string;
  name: string;
  slug: string;
  monogram?: string;        // e.g. "MA" — derived from name initials when absent
  logo_url?: string | null;
  verified?: boolean;
  rating_avg?: number | null;
  follower_count?: number | null;
  response_time_hours?: number | null;
};

function defaultMonogram(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function formatFollowers(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

interface SellerBlockProps {
  vendor: SellerBlockData;
  /** RTL/locale prefix for the storefront link. */
  storefrontHref?: string;
}

export function SellerBlock({ vendor, storefrontHref }: SellerBlockProps) {
  const followState = useFollowState(vendor.id);
  const followMutation = useFollowVendor();
  const unfollowMutation = useUnfollowVendor();
  const following = followState.data ?? false;
  const isPending = followMutation.isPending || unfollowMutation.isPending;
  const monogram = vendor.monogram ?? defaultMonogram(vendor.name);
  const href = storefrontHref ?? `/vendor/${vendor.slug}`;

  return (
    <div className="border border-nl-cacao/15 bg-white/40 px-5 py-4 flex items-center gap-3.5">
      <div
        className="w-12 h-12 flex-shrink-0 flex items-center justify-center text-nl-linen font-serif text-lg tracking-wider"
        style={{ background: "linear-gradient(135deg, hsl(var(--nl-russet)) 0%, hsl(var(--nl-cacao)) 100%)" }}
        aria-hidden="true"
      >
        {monogram}
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-[9px] tracking-[0.22em] uppercase text-nl-russet block">Sold by</span>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="font-serif text-lg leading-tight">{vendor.name}</span>
          {vendor.verified && (
            <BadgeCheck className="w-3.5 h-3.5 text-nl-amber" aria-label="Verified seller" />
          )}
        </div>
        <div className="flex gap-3 mt-1 text-[10.5px] text-nl-russet">
          {vendor.rating_avg != null && (
            <span className="flex items-center gap-1">
              <Star className="w-2.5 h-2.5 fill-nl-amber text-nl-amber" />
              {vendor.rating_avg.toFixed(1)}
            </span>
          )}
          {vendor.follower_count != null && (
            <span>· {formatFollowers(vendor.follower_count)} followers</span>
          )}
          {vendor.response_time_hours != null && (
            <span>· &lt; {vendor.response_time_hours}h reply</span>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() =>
            following
              ? unfollowMutation.mutate(vendor.id)
              : followMutation.mutate(vendor.id)
          }
          disabled={isPending}
          aria-pressed={following}
          className={cn(
            "px-3.5 py-2 text-[9.5px] tracking-[0.22em] uppercase border transition-colors",
            following
              ? "bg-nl-cacao text-nl-linen border-nl-cacao"
              : "bg-transparent text-nl-cacao border-nl-cacao hover:bg-nl-cacao/5",
            isPending && "opacity-60 cursor-wait",
          )}
        >
          {following ? "✓ Following" : "Follow"}
        </button>
        <Link
          href={href}
          className="text-[9px] tracking-[0.18em] uppercase text-nl-russet text-center hover:underline"
        >
          Visit store →
        </Link>
      </div>
    </div>
  );
}
