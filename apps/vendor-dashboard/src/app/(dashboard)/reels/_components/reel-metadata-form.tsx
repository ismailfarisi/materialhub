"use client";

import {
	type MyReelSummary,
	publishReel,
	updateReelMetadata,
} from "@/lib/api/reels";
import { Button } from "@materialhub/ui";
import { PaperPlaneTilt } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ProductTagPicker } from "./product-tag-picker";
import { ThumbnailPicker } from "./thumbnail-picker";

const LANGUAGES = [
	{ code: "en", label: "English" },
	{ code: "ar", label: "Arabic" },
	{ code: "hi", label: "Hindi" },
	{ code: "ur", label: "Urdu" },
	{ code: "ml", label: "Malayalam" },
];

export function ReelMetadataForm({ reel }: { reel: MyReelSummary }) {
	const router = useRouter();
	const [caption, setCaption] = useState(reel.caption ?? "");
	const [language, setLanguage] = useState(reel.language_code || "en");
	const [thumbnail, setThumbnail] = useState(reel.thumbnail_url);
	const [sponsored, setSponsored] = useState(reel.is_sponsored_disclosed);
	const [tags, setTags] = useState(
		(reel.tags ?? []).map((tag) => ({
			id: tag.id,
			product: tag.product ?? { id: tag.product_id, name: tag.product_id },
			timestampSeconds: Number(tag.timestamp_seconds),
		})),
	);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

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
			router.push("/reels");
		} catch (err: unknown) {
			const e = err as {
				response?: { data?: { error?: string } };
				message?: string;
			};
			setError(
				e?.response?.data?.error ?? e?.message ?? "Failed to save draft",
			);
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
			await publishReel(reel.id);
			router.push("/reels");
		} catch (err: unknown) {
			const e = err as {
				response?: { data?: { error?: string } };
				message?: string;
			};
			setError(e?.response?.data?.error ?? e?.message ?? "Failed to publish");
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="grid gap-6 xl:grid-cols-[360px_1fr]">
			<div className="space-y-3">
				<video
					src={reel.video_playback_url}
					poster={thumbnail}
					controls
					playsInline
					className="aspect-[9/16] w-full rounded-md bg-black object-contain"
				>
					<track kind="captions" />
				</video>
			</div>

			<div className="space-y-5 rounded-md border border-pearl/20 bg-white p-5">
				<div>
					<label
						htmlFor="reel-caption"
						className="block text-sm font-medium text-gray-900 mb-2"
					>
						Caption
					</label>
					<textarea
						id="reel-caption"
						value={caption}
						onChange={(event) => setCaption(event.target.value)}
						maxLength={500}
						className="min-h-28 w-full rounded-md border border-pearl/30 px-3 py-2 text-sm"
					/>
					<div className="mt-1 text-xs text-muted-foreground">
						{caption.length}/500
					</div>
				</div>

				<div className="grid gap-4 sm:grid-cols-2">
					<div>
						<label
							htmlFor="reel-language"
							className="block text-sm font-medium text-gray-900 mb-2"
						>
							Language
						</label>
						<select
							id="reel-language"
							value={language}
							onChange={(event) => setLanguage(event.target.value)}
							className="w-full rounded-md border border-pearl/30 px-3 py-2 text-sm"
						>
							{LANGUAGES.map((item) => (
								<option key={item.code} value={item.code}>
									{item.label}
								</option>
							))}
						</select>
					</div>

					<label className="flex items-center gap-2 pt-7 text-sm text-gray-700">
						<input
							type="checkbox"
							checked={sponsored}
							onChange={(event) => setSponsored(event.target.checked)}
						/>
						Sponsored or gifted products
					</label>
				</div>

				<ThumbnailPicker
					candidates={[reel.thumbnail_url]}
					initialUrl={thumbnail}
					onChange={setThumbnail}
				/>

				<ProductTagPicker
					reelId={reel.id}
					videoDurationSeconds={reel.video_duration_seconds}
					initialTags={tags}
					onChange={setTags}
				/>

				{error && (
					<div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
						{error}
					</div>
				)}

				<div className="flex flex-wrap gap-2">
					<Button
						type="button"
						variant="outline"
						onClick={handleSaveDraft}
						disabled={busy}
					>
						{busy ? "Saving..." : "Save draft"}
					</Button>
					<Button
						type="button"
						onClick={handlePublish}
						disabled={busy || tags.length === 0}
					>
						<PaperPlaneTilt size={16} className="mr-2" />
						{busy ? "Publishing..." : "Publish"}
					</Button>
				</div>
			</div>
		</div>
	);
}
