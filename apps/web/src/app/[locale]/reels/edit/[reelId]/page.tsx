"use client";

import { useEffect, useState } from "react";
import { getReel } from "@/lib/api/reels";
import { ReelMetadataForm } from "@/components/reels/reel-metadata-form";

export default function ReelEditPage({
  params,
}: {
  params: { locale: string; reelId: string };
}) {
  const [reel, setReel] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getReel(params.reelId)
      .then(setReel)
      .catch((e) => setError(e?.response?.data?.error ?? e?.message ?? "Failed to load"));
  }, [params.reelId]);

  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (!reel) return <div className="p-6">Loading...</div>;

  return <ReelMetadataForm reel={reel} />;
}
