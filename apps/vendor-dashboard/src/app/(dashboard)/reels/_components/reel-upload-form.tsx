"use client";

import { requestReelUpload } from "@/lib/api/reels";
import { uploadToCloudflareStream } from "@/lib/cloudflare-tus-upload";
import { Button } from "@materialhub/ui";
import { UploadSimple } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

const MAX_SIZE_MB = 200;
const ALLOWED_TYPES = ["video/mp4", "video/quicktime"];

export function ReelUploadForm() {
	const router = useRouter();
	const [file, setFile] = useState<File | null>(null);
	const [progress, setProgress] = useState(0);
	const [stage, setStage] = useState<"idle" | "uploading" | "complete">(
		"idle",
	);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
		const nextFile = event.target.files?.[0];
		if (!nextFile) return;
		if (nextFile.size > MAX_SIZE_MB * 1024 * 1024) {
			setError(`File too large. Maximum is ${MAX_SIZE_MB} MB.`);
			setFile(null);
			return;
		}
		if (!ALLOWED_TYPES.includes(nextFile.type)) {
			setError("Only MP4 or MOV files are allowed.");
			setFile(null);
			return;
		}
		setError(null);
		setProgress(0);
		setFile(nextFile);
	}

	async function startUpload() {
		if (!file) return;
		setBusy(true);
		setError(null);
		setProgress(0);
		setStage("uploading");

		try {
			const { uploadUrl, reelId } = await requestReelUpload();
			uploadToCloudflareStream({
				file,
				uploadUrl,
				onProgress: (p) => setProgress(p.percent),
				onSuccess: () => {
					setProgress(100);
					setStage("complete");
					router.push(`/reels/${reelId}/edit`);
				},
				onError: (uploadError) => {
					setError(uploadError.message || "Upload failed");
					setBusy(false);
					setStage("idle");
				},
			});
		} catch (uploadError: unknown) {
			const err = uploadError as {
				response?: { data?: { error?: string } };
				message?: string;
			};
			setError(err?.response?.data?.error ?? err?.message ?? "Upload failed");
			setBusy(false);
			setStage("idle");
		}
	}

	return (
		<div className="max-w-2xl space-y-5">
			<div className="rounded-md border border-pearl/20 bg-white p-5">
				<label
					htmlFor="reel-video-file"
					className="block text-sm font-medium text-gray-900 mb-2"
				>
					Video file
				</label>
				<input
					id="reel-video-file"
					type="file"
					accept="video/mp4,video/quicktime"
					onChange={handleFileChange}
					disabled={busy}
					className="block w-full text-sm file:mr-4 file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:text-primary-foreground"
				/>
				<p className="mt-2 text-xs text-muted-foreground">
					Vertical video, 3 to 90 seconds, up to {MAX_SIZE_MB} MB.
				</p>
			</div>

			{error && (
				<div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
					{error}
				</div>
			)}

			{busy && (
				<div className="rounded-md border border-pearl/20 bg-white p-5 space-y-2">
					{stage === "uploading" ? (
						<>
							<div className="h-2 overflow-hidden rounded bg-gray-100">
								<div
									className="h-2 rounded bg-primary transition-all"
									style={{ width: `${progress}%` }}
								/>
							</div>
							<div className="text-sm text-muted-foreground">
								Uploading {progress}%
							</div>
						</>
					) : (
						<div className="text-sm text-muted-foreground">
							Upload complete. Opening editor...
						</div>
					)}
				</div>
			)}

			<Button onClick={startUpload} disabled={!file || busy}>
				<UploadSimple size={16} className="mr-2" />
				Upload reel
			</Button>
		</div>
	);
}
