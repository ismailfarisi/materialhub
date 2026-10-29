"use client";

import { useAddPayoutNote } from "@/lib/queries/payouts";
import {
	Button,
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@materialhub/ui";
import { useState } from "react";

/**
 * NOTE: despite the name, POST /admin/payouts/:id/notes does NOT append —
 * `appendNote` assigns `payout.notes = note`, replacing whatever was there.
 * On a failed payout that existing value is the system-written failure reason
 * (the Stripe error, or the full reconciliation explanation with both
 * amounts), so saving here destroys the only record of why the money did not
 * move.
 *
 * Fixing that is a backend change (append, or a separate notes table) and is
 * out of this component's reach. Until then the dialog must not let an
 * operator overwrite blind: it shows the current note verbatim, pre-fills the
 * textarea with it so "adding" preserves it by default, and says plainly that
 * saving replaces.
 */
export function AddNoteDialog({
	open,
	onOpenChange,
	payoutId,
	currentNote,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	payoutId: string;
	currentNote?: string | null;
}) {
	// Mounted only while open (see the payout detail page), so the initial
	// value is the note as it stands at the moment the operator opens this.
	const [note, setNote] = useState(currentNote ?? "");
	const [error, setError] = useState<string | null>(null);
	const add = useAddPayoutNote();
	const hasExisting = Boolean(currentNote?.trim());

	function onSubmit() {
		setError(null);
		if (!note.trim()) {
			setError("Note cannot be empty.");
			return;
		}
		add.mutate(
			{ id: payoutId, note: note.trim() },
			{
				onSuccess: () => {
					onOpenChange(false);
					setNote("");
				},
				onError: (err: unknown) => {
					const msg = (err as { response?: { data?: { message?: string } } })
						?.response?.data?.message;
					setError(msg ?? "Failed to save note");
				},
			},
		);
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>{hasExisting ? "Edit Note" : "Add Note"}</DialogTitle>
				</DialogHeader>
				<div className="space-y-3">
					<div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
						Saving <strong>replaces</strong> this payout's entire note — it does
						not append. On a failed payout the existing text is the
						system-written failure reason (Stripe error or reconciliation
						detail). It is pre-filled below; keep it and add underneath rather
						than clearing it.
					</div>
					{hasExisting && (
						<div>
							<p className="text-xs text-muted-foreground mb-1">
								Current note (will be overwritten by whatever you save)
							</p>
							<pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted px-3 py-2 text-xs">
								{currentNote}
							</pre>
						</div>
					)}
					<label htmlFor="note-input" className="text-sm font-medium">
						Note
					</label>
					<textarea
						id="note-input"
						rows={6}
						value={note}
						onChange={(e) => setNote(e.target.value)}
						className="w-full px-3 py-2 border rounded-md text-sm"
					/>
					{error && <p className="text-sm text-destructive">{error}</p>}
				</div>
				<DialogFooter>
					<Button variant="ghost" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button onClick={onSubmit} disabled={add.isPending}>
						{add.isPending
							? "Saving…"
							: hasExisting
								? "Replace Note"
								: "Add Note"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
