"use client";

import { useReel } from "@/lib/queries/licensing";

export function ReelPreview({ reelId }: { reelId: string }) {
  const reel = useReel(reelId);
  if (reel.isLoading) return <span className="text-xs text-neutral-400">Loading reel…</span>;
  const data = reel.data;
  const href = data?.video_playback_url ?? undefined;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-2 text-xs text-blue-600 hover:underline"
    >
      {data?.thumbnail_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={data.thumbnail_url} alt="delivered reel" className="h-12 w-8 rounded object-cover" />
      ) : null}
      <span>View delivered reel</span>
    </a>
  );
}
