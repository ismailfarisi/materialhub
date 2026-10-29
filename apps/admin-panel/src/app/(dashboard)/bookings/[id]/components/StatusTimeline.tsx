"use client";

import { formatDateTime } from "@/lib/booking-format";
import { StatusBadge } from "@materialhub/ui";

interface StatusHistoryEntry {
  id: string;
  from_status: string | null;
  to_status: string;
  // booking-status-history.entity.ts:26 — nullable. A reaper/auto-complete
  // transition has no human actor, so this is null, not "system"; render it
  // as "system" rather than the literal string "null".
  actor_role: string | null;
  reason: string | null;
  created_at: string;
}

export function StatusTimeline({ history }: { history: StatusHistoryEntry[] }) {
  if (!history?.length) {
    return <p className="text-taupe text-sm">No status changes recorded.</p>;
  }

  return (
    <ol className="space-y-4">
      {history.map((entry) => (
        <li key={entry.id} className="flex gap-3">
          <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-pearl" />
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              {entry.from_status && (
                <>
                  <StatusBadge status={entry.from_status} />
                  <span className="text-taupe text-xs">→</span>
                </>
              )}
              <StatusBadge status={entry.to_status} />
            </div>
            <p className="text-taupe text-xs">
              {formatDateTime(entry.created_at)} · by {entry.actor_role ?? "system"}
            </p>
            {entry.reason && <p className="text-cacao text-sm">{entry.reason}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
