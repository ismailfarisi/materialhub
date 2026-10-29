"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { publishReel, updateReelMetadata } from "@/lib/api/reels";
import { ProductTagPicker } from "./product-tag-picker";
import { ThumbnailPicker } from "./thumbnail-picker";

interface ReelProp {
  id: string;
  video_playback_url: string;
  thumbnail_url: string;
  video_duration_seconds: number;
  caption?: string | null;
  language_code: string;
  is_sponsored_disclosed: boolean;
  tags?: Array<{
    id: string;
    product_id: string;
    timestamp_seconds: string | number;
    product?: { id: string; name: string };
  }>;
}

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "ar", label: "العربية" },
  { code: "hi", label: "हिन्दी" },
  { code: "ur", label: "اردو" },
  { code: "ml", label: "മലയാളം" },
];

export function ReelMetadataForm({ reel }: { reel: ReelProp }) {
  const router = useRouter();
  const [caption, setCaption] = useState(reel.caption ?? "");
  const [language, setLanguage] = useState(reel.language_code);
  const [thumbnail, setThumbnail] = useState(reel.thumbnail_url);
  const [sponsored, setSponsored] = useState(reel.is_sponsored_disclosed);
  const [tags, setTags] = useState(
    (reel.tags ?? []).map((t) => ({
      id: t.id,
      product: t.product ?? { id: t.product_id, name: t.product_id },
      timestampSeconds: Number(t.timestamp_seconds),
    })),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function saveMetadata() {
    await updateReelMetadata(reel.id, {
      caption,
      language_code: language,
      thumbnail_url: thumbnail,
      is_sponsored_disclosed: sponsored,
    });
  }

  async function handleSaveDraft() {
    setBusy(true);
    setError(null);
    try {
      await saveMetadata();
      router.push("/me/reels");
    } catch (e: any) {
      setError(e?.response?.data?.error ?? e?.message ?? "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  async function handlePublish() {
    if (tags.length === 0) {
      setError("Add at least one product tag before publishing.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await saveMetadata();
      const result = await publishReel(reel.id);
      router.push(`/reels/${result.id}`);
    } catch (e: any) {
      setError(e?.response?.data?.error ?? e?.message ?? "Failed to publish");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto p-6 space-y-4">
      <video
        src={reel.video_playback_url}
        poster={reel.thumbnail_url}
        controls
        playsInline
        className="w-full aspect-[9/16] bg-black object-contain"
      />

      <div>
        <label className="block text-sm font-semibold mb-1">Caption</label>
        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          maxLength={500}
          placeholder="Share your thoughts (optional, 500 chars max)"
          className="border p-2 w-full h-24"
        />
        <div className="text-xs text-gray-500">{caption.length}/500</div>
      </div>

      <div>
        <label className="block text-sm font-semibold mb-1">Language</label>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="border p-2"
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
      </div>

      <ThumbnailPicker
        candidates={[reel.thumbnail_url]}
        initialUrl={reel.thumbnail_url}
        onChange={setThumbnail}
      />

      <ProductTagPicker
        reelId={reel.id}
        videoDurationSeconds={reel.video_duration_seconds}
        initialTags={tags}
        onChange={setTags}
      />

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={sponsored}
          onChange={(e) => setSponsored(e.target.checked)}
        />
        This reel includes gifted or sponsored products
      </label>

      {error && <div className="text-red-600 text-sm">{error}</div>}

      <div className="flex gap-2">
        <button
          onClick={handleSaveDraft}
          disabled={busy}
          className="bg-gray-200 text-black px-4 py-2 rounded"
        >
          {busy ? "Saving..." : "Save as draft"}
        </button>
        <button
          onClick={handlePublish}
          disabled={busy}
          className="bg-black text-white px-4 py-2 rounded"
        >
          {busy ? "Publishing..." : "Publish"}
        </button>
      </div>
    </div>
  );
}
