"use client";

import {
  type PendingWrite,
  useApprovePendingWrite,
  useRejectPendingWrite,
} from "@/lib/queries/integrations";
import { Button, StatusBadge } from "@materialhub/ui";
import { Check, X } from "lucide-react";
import { useState } from "react";
import { PendingWriteDetailDialog } from "./PendingWriteDetailDialog";

interface PendingWritesTableProps {
  rows: PendingWrite[];
}

export function PendingWritesTable({ rows }: PendingWritesTableProps) {
  const [selected, setSelected] = useState<PendingWrite | null>(null);
  const approve = useApprovePendingWrite();
  const reject = useRejectPendingWrite();

  if (rows.length === 0) {
    return (
      <div className="rounded-md border bg-card p-12 text-center text-sm text-muted-foreground">
        No pending writes.
      </div>
    );
  }

  return (
    <>
      <div className="rounded-md border bg-card overflow-hidden">
        <table className="w-full text-sm" data-stack="md">
          <thead className="bg-muted/30 text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3 text-left">When</th>
              <th className="px-4 py-3 text-left">Kind</th>
              <th className="px-4 py-3 text-left">Vendor</th>
              <th className="px-4 py-3 text-left">Diff</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                onClick={() => setSelected(r)}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setSelected(r);
                }}
                className="border-t cursor-pointer hover:bg-muted/30 transition-colors"
              >
                <td className="px-4 py-3 text-muted-foreground" data-label="When">{timeAgo(r.created_at)}</td>
                <td className="px-4 py-3 font-mono text-xs" data-label="Kind">{r.kind}</td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground" data-label="Vendor">
                  {r.vendor_id.slice(0, 8)}
                </td>
                <td className="px-4 py-3 font-mono text-xs" data-label="Diff">{summarizeDiff(r)}</td>
                <td className="px-4 py-3" data-label="Status">
                  <StatusBadge status={r.status} />
                </td>
                <td
                  className="px-4 py-3 text-right"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  {r.status === "pending" && (
                    <div className="inline-flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={approve.isPending && approve.variables === r.id}
                        onClick={() => approve.mutate(r.id)}
                      >
                        <Check className="size-3 mr-1" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={reject.isPending && reject.variables === r.id}
                        onClick={() => reject.mutate(r.id)}
                      >
                        <X className="size-3 mr-1" />
                        Reject
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > 0 && (
          <div className="border-t px-4 py-3 text-xs text-muted-foreground">
            Total: {rows.length} pending write{rows.length === 1 ? "" : "s"}
          </div>
        )}
      </div>

      <PendingWriteDetailDialog
        write={selected}
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      />
    </>
  );
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)} min ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)} hr ago`;
  return `${Math.floor(ms / 86_400_000)} d ago`;
}

function summarizeDiff(r: PendingWrite): string {
  const p = r.payload;
  if (r.kind === "inventory.adjust") {
    const delta = p.delta ?? p.quantity ?? "?";
    const sku = p.sku ?? p.product_sku ?? "";
    const sign = typeof delta === "number" && delta > 0 ? "+" : "";
    return `${sign}${delta} ${sku}`.trim();
  }
  if (r.kind === "product.update_price") {
    const cur = (r.current_value as Record<string, unknown> | null)?.price;
    const next = p.price ?? p.price_fils;
    return cur != null ? `${cur} → ${next} fils` : `→ ${next} fils`;
  }
  if (r.kind === "product.update_attribute") {
    const attrs = p.attributes as Record<string, unknown> | undefined;
    const keys = Object.keys(attrs ?? {});
    return keys.length > 0 ? keys.slice(0, 3).join(", ") + (keys.length > 3 ? "…" : "") : "—";
  }
  return "—";
}
