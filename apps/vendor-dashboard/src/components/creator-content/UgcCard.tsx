"use client";

import { type DiscoveryCard, formatAED } from "@/lib/queries/creator-content";

export function UgcCard({
  card,
  onOpen,
  onToggleSave,
  saving,
  onOffer,
  onInviteToCollab,
}: {
  card: DiscoveryCard;
  onOpen: (card: DiscoveryCard) => void;
  onToggleSave: (card: DiscoveryCard) => void;
  saving: boolean;
  onOffer?: (card: DiscoveryCard) => void;
  onInviteToCollab?: (card: DiscoveryCard) => void;
}) {
  return (
    <div className="rounded-lg border border-neutral-200 overflow-hidden bg-white flex flex-col">
      <button
        type="button"
        className="relative aspect-[9/16] bg-neutral-100"
        onClick={() => onOpen(card)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={card.thumbnail_url}
          alt={card.caption ?? "reel"}
          className="h-full w-full object-cover"
        />
        <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 text-xs text-white">
          {card.video_duration_seconds}s
        </span>
      </button>
      <div className="p-2 flex flex-col gap-1">
        <p className="truncate text-sm font-medium">{card.creator.name}</p>
        {card.caption && <p className="truncate text-xs text-neutral-500">{card.caption}</p>}
        <div className="flex flex-wrap gap-1">
          {card.tagged_products.slice(0, 3).map((p) => (
            <span key={p.id} className="rounded bg-neutral-100 px-1 text-xs">
              {p.name}
            </span>
          ))}
        </div>
        <div className="flex items-center justify-between text-xs text-neutral-600">
          <span>{card.engagement.views} views</span>
          {card.attributed && <span>{formatAED(card.attributed.gmv_fils)}</span>}
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={() => onToggleSave(card)}
          className={`mt-1 rounded px-2 py-1 text-xs ${
            card.is_shortlisted ? "bg-rose-100 text-rose-700" : "bg-neutral-900 text-white"
          }`}
        >
          {card.is_shortlisted ? "★ Shortlisted" : "☆ Shortlist"}
        </button>
        {onOffer && (
          <button
            type="button"
            onClick={() => onOffer(card)}
            className="rounded border border-neutral-900 px-2 py-1 text-xs text-neutral-900"
          >
            Offer to license
          </button>
        )}
        {onInviteToCollab && (
          <button
            type="button"
            onClick={() => onInviteToCollab(card)}
            className="rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-700"
          >
            Invite to collab
          </button>
        )}
      </div>
    </div>
  );
}
