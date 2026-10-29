"use client";

import { ReelFeed } from "@/components/reels/reel-feed";

export default function ReelPage({
  params,
}: {
  params: { locale: string; reelId: string };
}) {
  return (
    <ReelFeed
      seedReelId={params.reelId}
      locale={params.locale}
      hideTabSwitcher
    />
  );
}
