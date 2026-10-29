"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@materialhub/ui";
import {
  PERMISSION_DESCRIPTIONS,
  PERMISSION_GROUPS,
  ROLES,
  type Role,
} from "@/lib/permissions";
import {
  useRolePermissionsMatrix,
  useUpdateRolePermissions,
} from "@/lib/queries/role-permissions";

const FLAG_ENABLED = process.env.NEXT_PUBLIC_TEAM_MANAGEMENT_ENABLED === "true";

export default function RolePermissionsPage() {
  const { data, isLoading } = useRolePermissionsMatrix();
  const update = useUpdateRolePermissions();

  // Per-role dirty state. `Set` is mutated by re-creating, so React re-renders.
  const [pending, setPending] = useState<Record<Role, Set<string>>>({
    owner: new Set(),
    manager: new Set(),
    staff: new Set(),
    viewer: new Set(),
  });

  useEffect(() => {
    if (data?.matrix) {
      setPending({
        owner: new Set(data.matrix.owner),
        manager: new Set(data.matrix.manager),
        staff: new Set(data.matrix.staff),
        viewer: new Set(data.matrix.viewer),
      });
    }
  }, [data?.matrix]);

  const dirtyRoles = useMemo<Role[]>(() => {
    if (!data?.matrix) return [];
    return ROLES.filter((r) => {
      const before = new Set(data.matrix[r]);
      const after = pending[r];
      if (before.size !== after.size) return true;
      for (const p of before) if (!after.has(p)) return true;
      return false;
    });
  }, [data?.matrix, pending]);

  if (!FLAG_ENABLED) {
    return (
      <div className="p-8 text-sm text-zinc-500">
        Role permissions UI is not yet available.
      </div>
    );
  }

  if (isLoading || !data) {
    return <div className="p-8 text-sm text-zinc-500">Loading…</div>;
  }

  function toggle(role: Role, perm: string) {
    if (role === "owner") return;
    setPending((prev) => {
      const next = new Set(prev[role]);
      if (next.has(perm)) next.delete(perm);
      else next.add(perm);
      return { ...prev, [role]: next };
    });
  }

  async function save() {
    for (const role of dirtyRoles) {
      await update.mutateAsync({ role, permissions: Array.from(pending[role]) });
    }
  }

  return (
    <div className="p-8">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Role Permissions</h1>
        {data.lastUpdatedAt && (
          <p className="text-xs text-zinc-500">
            Last updated{data.lastUpdatedBy ? ` by ${data.lastUpdatedBy.name}` : ""} at{" "}
            {new Date(data.lastUpdatedAt).toLocaleString()}
          </p>
        )}
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-zinc-500 border-b">
              <th className="py-2 px-3 font-medium">Permission</th>
              {ROLES.map((r) => (
                <th key={r} className="py-2 px-3 text-center capitalize font-medium">
                  {r}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(PERMISSION_GROUPS).map(([group, perms]) => (
              <Group
                key={group}
                group={group}
                perms={perms}
                pending={pending}
                onToggle={toggle}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <Button
          disabled={dirtyRoles.length === 0 || update.isPending}
          onClick={save}
        >
          {update.isPending
            ? "Saving…"
            : `Save (${dirtyRoles.length} role${dirtyRoles.length === 1 ? "" : "s"})`}
        </Button>
      </div>

      {update.isError && (
        <div className="mt-3 text-xs text-red-600">
          {(update.error as { response?: { data?: { message?: string } } })?.response?.data
            ?.message ?? "Save failed"}
        </div>
      )}

      <details className="mt-10 text-xs">
        <summary className="cursor-pointer text-zinc-500">Permission catalog</summary>
        <ul className="mt-3 space-y-1">
          {data.catalog.map((p) => (
            <li key={p}>
              <code>{p}</code> — {PERMISSION_DESCRIPTIONS[p] ?? <em>(no description)</em>}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function Group({
  group,
  perms,
  pending,
  onToggle,
}: {
  group: string;
  perms: string[];
  pending: Record<Role, Set<string>>;
  onToggle: (role: Role, perm: string) => void;
}) {
  return (
    <>
      <tr>
        <td colSpan={5} className="pt-4 text-xs uppercase text-zinc-400 px-3">
          {group}
        </td>
      </tr>
      {perms.map((perm) => (
        <tr key={perm} className="border-t">
          <td className="py-2 px-3">
            <code className="text-xs">{perm}</code>
            {PERMISSION_DESCRIPTIONS[perm] && (
              <span className="ml-2 text-xs text-zinc-400">
                {PERMISSION_DESCRIPTIONS[perm]}
              </span>
            )}
          </td>
          {ROLES.map((role) => {
            const checked = pending[role].has(perm);
            const disabled = role === "owner";
            return (
              <td key={`${role}-${perm}`} className="py-2 px-3 text-center">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  title={
                    disabled ? "Owners always have all permissions" : undefined
                  }
                  onChange={() => onToggle(role, perm)}
                />
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
