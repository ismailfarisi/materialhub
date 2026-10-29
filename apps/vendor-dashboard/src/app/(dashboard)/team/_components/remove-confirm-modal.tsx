"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@materialhub/ui";
import { useRemoveMember } from "@/lib/queries/vendor-members";

export function RemoveConfirmModal({
  memberId,
  memberEmail,
  onClose,
}: {
  memberId: string | null;
  memberEmail?: string;
  onClose: () => void;
}) {
  const [confirm, setConfirm] = useState("");
  const remove = useRemoveMember();

  function handleClose() {
    setConfirm("");
    remove.reset();
    onClose();
  }

  const ready = confirm === "REMOVE";

  return (
    <Dialog open={Boolean(memberId)} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Remove {memberEmail}?</DialogTitle>
          <DialogDescription>
            This revokes their access immediately. Type{" "}
            <span className="font-mono font-semibold">REMOVE</span> to confirm.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          <input
            type="text"
            className="w-full rounded border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="REMOVE"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />

          {remove.isError && (
            <p className="mt-2 text-xs text-red-600">
              {(remove.error as { response?: { data?: { message?: string } } })?.response?.data
                ?.message ?? "Failed to remove member"}
            </p>
          )}
        </div>

        <DialogFooter>
          <button type="button" onClick={handleClose} className="text-sm px-4 py-2">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => remove.mutate(memberId!, { onSuccess: handleClose })}
            disabled={!ready || remove.isPending}
            className="rounded bg-red-600 px-4 py-2 text-sm text-white disabled:opacity-50 hover:bg-red-700"
          >
            {remove.isPending ? "Removing…" : "Remove"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
