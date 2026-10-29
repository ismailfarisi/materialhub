"use client";

import type { PendingWrite } from "@/lib/queries/integrations";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@materialhub/ui";
import { StatusBadge } from "@materialhub/ui";

interface PendingWriteDetailDialogProps {
  write: PendingWrite | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)} min ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)} hr ago`;
  return `${Math.floor(ms / 86_400_000)} d ago`;
}

export function PendingWriteDetailDialog({
  write,
  open,
  onOpenChange,
}: PendingWriteDetailDialogProps) {
  if (!write) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 flex-wrap">
            <span className="font-mono text-sm">{write.kind}</span>
            <StatusBadge status={write.status} />
            <span className="text-xs text-muted-foreground font-normal">
              {timeAgo(write.created_at)}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 mt-2">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Proposed payload
            </p>
            <pre className="rounded border bg-muted/40 p-3 text-xs font-mono overflow-auto max-h-80 whitespace-pre-wrap break-all">
              {JSON.stringify(write.payload, null, 2)}
            </pre>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Current value
            </p>
            {write.current_value != null ? (
              <pre className="rounded border bg-muted/40 p-3 text-xs font-mono overflow-auto max-h-80 whitespace-pre-wrap break-all">
                {JSON.stringify(write.current_value, null, 2)}
              </pre>
            ) : (
              <div className="rounded border bg-muted/40 p-3 text-xs font-mono text-muted-foreground h-12 flex items-center">
                —
              </div>
            )}
          </div>
        </div>

        {write.reason && (
          <div className="mt-2 space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Reason
            </p>
            <p className="text-sm text-foreground">{write.reason}</p>
          </div>
        )}

        <div className="mt-4 pt-4 border-t flex gap-6 text-xs font-mono text-muted-foreground flex-wrap">
          <span>
            <span className="text-foreground font-semibold">integration</span>{" "}
            {write.integration_id}
          </span>
          <span>
            <span className="text-foreground font-semibold">vendor</span> {write.vendor_id}
          </span>
          {write.reviewed_by && (
            <span>
              <span className="text-foreground font-semibold">reviewed by</span> {write.reviewed_by}
            </span>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
