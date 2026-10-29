"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LayoutBlockVideo, LayoutVideo, S3UploadClient } from "../../hooks/use-s3-upload";

const MAX_BYTES = 25 * 1024 * 1024;
const MAX_DURATION_SECONDS = 15;
const ACCEPT = "video/mp4,video/webm";
const POLL_MS = 2000;
const MAX_POLLS = 150; // ~5 minutes
const PROBE_TIMEOUT_MS = 10000;

type Phase =
	| { kind: "idle" }
	| { kind: "uploading"; pct: number }
	| { kind: "processing" }
	| { kind: "error"; message: string };

/**
 * Reads duration client-side so a doomed 25MB upload is refused up front.
 *
 * Bounded by a timeout: a file that fires neither `loadedmetadata` nor `error`
 * would otherwise leave the field sitting in `idle` with no feedback at all,
 * looking to the merchant like the click did nothing.
 */
function probeDuration(file: File): Promise<number> {
	return new Promise((resolve, reject) => {
		const el = document.createElement("video");
		const objectUrl = URL.createObjectURL(file);
		let settled = false;
		const finish = (fn: () => void) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			URL.revokeObjectURL(objectUrl);
			fn();
		};
		const timer = setTimeout(
			() => finish(() => reject(new Error("Could not read that video file."))),
			PROBE_TIMEOUT_MS,
		);
		el.preload = "metadata";
		el.onloadedmetadata = () => finish(() => resolve(el.duration));
		el.onerror = () => finish(() => reject(new Error("Could not read that video file.")));
		el.src = objectUrl;
	});
}

/** Axios puts the status on `response.status`; a fetch-based client on `status`. */
function isNotFound(e: unknown): boolean {
	const err = e as { status?: number; response?: { status?: number } } | null;
	return err?.response?.status === 404 || err?.status === 404;
}

export function VideoField({
	value,
	onChange,
	client,
}: {
	value: LayoutBlockVideo | null;
	onChange: (v: LayoutBlockVideo | null) => void;
	client: S3UploadClient;
}) {
	const [phase, setPhase] = useState<Phase>({ kind: "idle" });
	const cancelled = useRef(false);

	useEffect(() => {
		cancelled.current = false;
		return () => {
			cancelled.current = true;
		};
	}, []);

	const poll = useCallback(
		async (id: string) => {
			for (let i = 0; i < MAX_POLLS; i++) {
				await new Promise((r) => setTimeout(r, POLL_MS));
				if (cancelled.current) return;
				// A single flaky request must not end the flow: the row and its
				// quota slot survive on the server, and the transcode is still
				// running, so the only thing giving up would achieve is stranding
				// both. Still bounded by MAX_POLLS.
				let row: LayoutVideo | undefined;
				try {
					row = await client.getLayoutVideo?.(id);
				} catch {
					if (cancelled.current) return;
					continue;
				}
				if (cancelled.current) return;
				if (!row) return;
				if (row.status === "ready") {
					onChange({
						id: row.id,
						url: row.url,
						poster_url: row.poster_url,
						duration_seconds: row.duration_seconds,
					});
					setPhase({ kind: "idle" });
					return;
				}
				if (row.status === "failed") {
					setPhase({
						kind: "error",
						message: "That video could not be processed. Try a different file.",
					});
					return;
				}
			}
			setPhase({
				kind: "error",
				message: "Still processing after 5 minutes. Reload to check again.",
			});
		},
		[client, onChange],
	);

	async function handleFile(file: File) {
		setPhase({ kind: "idle" });
		if (file.size > MAX_BYTES) {
			setPhase({ kind: "error", message: "Video must be 25MB or smaller." });
			return;
		}
		let duration: number;
		try {
			duration = await probeDuration(file);
		} catch (e) {
			setPhase({ kind: "error", message: (e as Error).message });
			return;
		}
		if (duration > MAX_DURATION_SECONDS) {
			setPhase({
				kind: "error",
				message: `Video must be 15 seconds or shorter (this one is ${Math.round(duration)}s).`,
			});
			return;
		}

		try {
			setPhase({ kind: "uploading", pct: 0 });
			const { uploadUrl, key } = await client.presignLayoutVideo!({
				filename: file.name,
				contentType: file.type,
				sizeBytes: file.size,
			});
			await client.putToS3(uploadUrl, file, (pct) => setPhase({ kind: "uploading", pct }));
			setPhase({ kind: "processing" });
			const { id } = await client.processLayoutVideo!({ key });
			await poll(id);
		} catch (e) {
			setPhase({ kind: "error", message: (e as Error).message || "Upload failed." });
		}
	}

	/**
	 * The delete runs FIRST and the value is cleared only if it succeeds.
	 *
	 * Clearing optimistically and swallowing the failure defeats the reason this
	 * call exists: the block loses its reference while the row survives, so the
	 * video is unreachable *and* still consuming one of the vendor's ten slots.
	 * A 404 counts as success — the row is already gone.
	 */
	async function handleRemove() {
		const id = value?.id;
		if (!id) {
			onChange(null);
			setPhase({ kind: "idle" });
			return;
		}
		setPhase({ kind: "idle" });
		try {
			await client.deleteLayoutVideo?.(id);
		} catch (e) {
			if (!isNotFound(e)) {
				setPhase({
					kind: "error",
					message: "Couldn't remove that video — try again.",
				});
				return;
			}
		}
		onChange(null);
	}

	// Client can't do video uploads — render nothing rather than a dead control.
	if (!client.presignLayoutVideo) return null;

	return (
		<div className="space-y-2">
			{value ? (
				<div className="space-y-2">
					{/* biome-ignore lint/a11y/useMediaCaption: decorative, muted, no audio track */}
					<video
						src={value.url}
						poster={value.poster_url}
						muted
						loop
						autoPlay
						playsInline
						className="h-32 w-full rounded object-cover"
					/>
					<div className="flex items-center justify-between text-xs text-taupe">
						<span>{value.duration_seconds}s · muted loop</span>
						<button type="button" onClick={handleRemove} className="underline">
							Remove
						</button>
					</div>
				</div>
			) : (
				<input
					data-testid="video-file-input"
					type="file"
					accept={ACCEPT}
					disabled={phase.kind === "uploading" || phase.kind === "processing"}
					onChange={(e) => {
						const f = e.target.files?.[0];
						// Clearing the input is what lets the same file be picked again
						// after a rejection — `change` only fires when the value differs.
						e.target.value = "";
						if (f) void handleFile(f);
					}}
					className="text-sm"
				/>
			)}

			{phase.kind === "uploading" && <p className="text-xs text-taupe">Uploading… {phase.pct}%</p>}
			{phase.kind === "processing" && (
				<p className="text-xs text-taupe">Processing video — this usually takes under a minute.</p>
			)}
			{phase.kind === "error" && <p className="text-xs text-red-600">{phase.message}</p>}
		</div>
	);
}
