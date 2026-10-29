"use client";

import { useReindexStatus, useStartReindex } from "@/lib/queries/search";
import { Button } from "@materialhub/ui";
import { AlertCircle, CheckCircle2, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function ReindexSearchButton() {
	const start = useStartReindex();
	const { data: status } = useReindexStatus();
	const [flash, setFlash] = useState<
		{ kind: "success" | "error"; text: string } | null
	>(null);
	const lastJobIdRef = useRef<string | null>(null);

	// When an active job finishes (state flips from active/waiting to
	// completed/failed), surface a flash message.
	useEffect(() => {
		if (!status?.jobId) return;
		if (status.jobId === lastJobIdRef.current) return;

		if (status.state === "completed" && status.result) {
			lastJobIdRef.current = status.jobId;
			const secs = Math.round(status.result.durationMs / 1000);
			setFlash({
				kind: "success",
				text: `Reindexed ${status.result.processed} products in ${secs}s`,
			});
			const t = setTimeout(() => setFlash(null), 6000);
			return () => clearTimeout(t);
		}
		if (status.state === "failed") {
			lastJobIdRef.current = status.jobId;
			setFlash({
				kind: "error",
				text: status.failedReason ?? "Reindex failed",
			});
			const t = setTimeout(() => setFlash(null), 10000);
			return () => clearTimeout(t);
		}
	}, [status?.jobId, status?.state, status?.result, status?.failedReason]);

	const isRunning = status?.state === "active" || status?.state === "waiting";
	const percent = status?.progress?.percent ?? 0;
	const processed = status?.progress?.processed ?? 0;
	const total = status?.progress?.total ?? 0;

	return (
		<div className="flex items-center gap-3">
			{flash && (
				<span
					className={`flex items-center gap-1 text-xs ${
						flash.kind === "success" ? "text-green-700" : "text-red-700"
					}`}
				>
					{flash.kind === "success" ? (
						<CheckCircle2 size={14} />
					) : (
						<AlertCircle size={14} />
					)}
					{flash.text}
				</span>
			)}

			{isRunning && status?.progress && (
				<span className="text-xs text-taupe">
					{processed}/{total} ({percent}%)
				</span>
			)}

			<Button
				variant="outline"
				onClick={() => start.mutate()}
				disabled={isRunning || start.isPending}
				title="Rebuild the Typesense search index from the database"
			>
				<RefreshCw
					size={16}
					className={`mr-2 ${isRunning ? "animate-spin" : ""}`}
				/>
				{isRunning ? "Reindexing…" : "Reindex Search"}
			</Button>
		</div>
	);
}
