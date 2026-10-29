"use client";

import { useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@materialhub/ui";
import { useInviteMember } from "@/lib/queries/vendor-members";

export function InviteModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"manager" | "staff" | "viewer">("staff");
  const invite = useInviteMember();

  function handleClose() {
    setEmail("");
    setRole("staff");
    invite.reset();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite a team member</DialogTitle>
          <DialogDescription>
            They&apos;ll get an email link to join. The invite expires in 7 days.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              type="email"
              required
              placeholder="email@example.com"
              className="w-full rounded border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Role</label>
            <select
              className="w-full rounded border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              value={role}
              onChange={(e) => setRole(e.target.value as "manager" | "staff" | "viewer")}
            >
              <option value="manager">Manager</option>
              <option value="staff">Staff</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>

          {invite.isError && (
            <p className="text-xs text-red-600">
              {(invite.error as { response?: { data?: { message?: string } } })?.response?.data
                ?.message ?? "Failed to send invite"}
            </p>
          )}
        </div>

        <DialogFooter>
          <button type="button" onClick={handleClose} className="text-sm px-4 py-2">
            Cancel
          </button>
          <Button
            onClick={() => invite.mutate({ email, role }, { onSuccess: handleClose })}
            disabled={!email || invite.isPending}
          >
            {invite.isPending ? "Sending…" : "Send invite"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
