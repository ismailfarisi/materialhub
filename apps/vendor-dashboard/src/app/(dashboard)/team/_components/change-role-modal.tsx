"use client";

import { useEffect, useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@materialhub/ui";
import { useChangeRole } from "@/lib/queries/vendor-members";

export function ChangeRoleModal({
  memberId,
  currentRole,
  onClose,
}: {
  memberId: string | null;
  currentRole?: string;
  onClose: () => void;
}) {
  const [role, setRole] = useState<"manager" | "staff" | "viewer">("staff");
  const change = useChangeRole();

  useEffect(() => {
    if (currentRole === "manager" || currentRole === "staff" || currentRole === "viewer") {
      setRole(currentRole);
    }
  }, [currentRole]);

  function handleClose() {
    change.reset();
    onClose();
  }

  return (
    <Dialog open={Boolean(memberId)} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Change role</DialogTitle>
          <DialogDescription>
            Select a new role for this team member.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          <select
            className="w-full rounded border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            value={role}
            onChange={(e) => setRole(e.target.value as "manager" | "staff" | "viewer")}
          >
            <option value="manager">Manager</option>
            <option value="staff">Staff</option>
            <option value="viewer">Viewer</option>
          </select>

          {change.isError && (
            <p className="mt-2 text-xs text-red-600">
              {(change.error as { response?: { data?: { message?: string } } })?.response?.data
                ?.message ?? "Failed to update role"}
            </p>
          )}
        </div>

        <DialogFooter>
          <button type="button" onClick={handleClose} className="text-sm px-4 py-2">
            Cancel
          </button>
          <Button
            onClick={() =>
              change.mutate({ memberId: memberId!, role }, { onSuccess: handleClose })
            }
            disabled={change.isPending}
          >
            {change.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
