"use client";

import { useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@materialhub/ui";
import { api } from "@/lib/api";
import { useTeamMembers, useTransferOwnership } from "@/lib/queries/vendor-members";

const FLAG_ENABLED = process.env.NEXT_PUBLIC_TEAM_MANAGEMENT_ENABLED !== "false";

export default function TransferOwnershipPage() {
  const { data: members = [] } = useTeamMembers();
  const transfer = useTransferOwnership();
  const [target, setTarget] = useState<string>("");
  const [confirm, setConfirm] = useState("");
  const [newOwnerEmail, setNewOwnerEmail] = useState<string | null>(null);
  const queryClient = useQueryClient();

  if (!FLAG_ENABLED) {
    return (
      <div className="p-8 text-sm text-zinc-500">
        Team management is not yet available.
      </div>
    );
  }

  if (newOwnerEmail) {
    return (
      <div className="p-8 max-w-xl" role="status">
        <h1 className="text-2xl font-semibold">Ownership transferred</h1>
        <p className="mt-2 text-sm text-zinc-600">
          {newOwnerEmail} is now the owner of this store. You are a manager.
        </p>
        <Link href="/team" className="mt-6 inline-block text-sm underline">
          Back to Team
        </Link>
      </div>
    );
  }

  const candidates = members.filter((m) => m.role === "manager" && m.status === "active");
  const ready = Boolean(target) && confirm === "TRANSFER";

  return (
    <div className="p-8 max-w-xl">
      <h1 className="text-2xl font-semibold">Transfer ownership</h1>
      <p className="mt-2 text-sm text-zinc-500">
        This is irreversible. After transfer, you become a manager and lose owner-only
        powers (team management, bank account changes, ownership transfer).
      </p>

      <label className="mt-6 block text-sm font-medium" htmlFor="target-member">
        Choose new owner (active managers only)
      </label>
      {candidates.length === 0 ? (
        <p className="mt-2 text-sm text-orange-600">
          No active managers available. Promote someone to manager before transferring
          ownership.
        </p>
      ) : (
        <select
          id="target-member"
          className="mt-2 w-full rounded border border-zinc-300 px-3 py-2 text-sm"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        >
          <option value="">— select —</option>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.email}
            </option>
          ))}
        </select>
      )}

      <label className="mt-4 block text-sm font-medium" htmlFor="confirm-text">
        Type TRANSFER to confirm
      </label>
      <input
        id="confirm-text"
        type="text"
        className="mt-2 w-full rounded border border-zinc-300 px-3 py-2 text-sm"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        autoComplete="off"
      />

      {transfer.isError && (
        <div className="mt-3 text-xs text-red-600">
          {(transfer.error as { response?: { data?: { message?: string } } })?.response
            ?.data?.message ?? "Transfer failed"}
        </div>
      )}

      <div className="mt-6 flex justify-end gap-3">
        <Link href="/team" className="text-sm self-center">
          Cancel
        </Link>
        <Button
          disabled={!ready || transfer.isPending}
          onClick={() =>
            transfer.mutate(target, {
              onSuccess: async () => {
                // Our role changed: re-issue the token so the vm claim says manager,
                // then drop cached data that was fetched as owner.
                await api.post("/auth/refresh", {}).catch(() => {});
                void queryClient.invalidateQueries();
                setNewOwnerEmail(candidates.find((c) => c.id === target)?.email ?? "The new owner");
              },
            })
          }
          variant="destructive"
        >
          {transfer.isPending ? "Transferring…" : "Transfer ownership"}
        </Button>
      </div>
    </div>
  );
}
