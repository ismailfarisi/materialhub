"use client";

import { useState } from "react";
import { InviteToCollabModal } from "@/components/creator-content/InviteToCollabModal";
import { UgcCard } from "@/components/creator-content/UgcCard";
import { UgcPlayerModal } from "@/components/creator-content/UgcPlayerModal";
import { OfferModal } from "@/components/licensing/OfferModal";
import {
  type DiscoveryCard,
  type MineSort,
  useBrowseUgc,
  useMyUgc,
  useShortlist,
  useToggleShortlist,
} from "@/lib/queries/creator-content";

type Tab = "mine" | "discover" | "shortlist";

export default function CreatorContentPage() {
  const [tab, setTab] = useState<Tab>("mine");
  const [mineSort, setMineSort] = useState<MineSort>("recent");
  const [q, setQ] = useState("");
  const [active, setActive] = useState<DiscoveryCard | null>(null);
  const [offerReelId, setOfferReelId] = useState<string | null>(null);
  const [inviteCard, setInviteCard] = useState<DiscoveryCard | null>(null);

  const mine = useMyUgc({ sort: mineSort });
  const browse = useBrowseUgc({ sort: "ranking", q });
  const shortlist = useShortlist();
  const toggle = useToggleShortlist();

  const current = tab === "mine" ? mine : tab === "discover" ? browse : shortlist;
  const items = current.data?.items ?? [];

  return (
    <div className="p-4">
      <h1 className="mb-4 text-xl font-semibold">Creator Content</h1>

      <div className="mb-4 flex gap-2">
        {(["mine", "discover", "shortlist"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded px-3 py-1 text-sm ${tab === t ? "bg-neutral-900 text-white" : "bg-neutral-100"}`}
          >
            {t === "mine" ? "My UGC" : t === "discover" ? "Discover" : "Shortlist"}
          </button>
        ))}
      </div>

      {tab === "mine" && (
        <select
          value={mineSort}
          onChange={(e) => setMineSort(e.target.value as MineSort)}
          className="mb-3 rounded border px-2 py-1 text-sm"
        >
          <option value="recent">Most recent</option>
          <option value="most_viewed">Most viewed</option>
          <option value="most_gmv">Most attributed sales</option>
          <option value="most_taps">Most product taps</option>
        </select>
      )}

      {tab === "discover" && (
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search captions…"
          className="mb-3 w-full max-w-sm rounded border px-2 py-1 text-sm"
        />
      )}

      {current.isLoading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-neutral-500">No videos yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {items.map((card) => (
            <UgcCard
              key={card.id}
              card={card}
              onOpen={setActive}
              saving={toggle.isPending}
              onToggleSave={(c) => toggle.mutate({ reelId: c.id, saved: c.is_shortlisted })}
              onOffer={(c) => setOfferReelId(c.id)}
              onInviteToCollab={(c) => setInviteCard(c)}
            />
          ))}
        </div>
      )}

      <UgcPlayerModal card={active} onClose={() => setActive(null)} />
      {offerReelId && (
        <OfferModal
          reelId={offerReelId}
          open={offerReelId !== null}
          onClose={() => setOfferReelId(null)}
        />
      )}
      {inviteCard && (
        <InviteToCollabModal card={inviteCard} onClose={() => setInviteCard(null)} />
      )}
    </div>
  );
}
