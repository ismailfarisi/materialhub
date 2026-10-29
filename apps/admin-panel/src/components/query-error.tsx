"use client";

import { Button } from "@materialhub/ui";

// A failed list query must never render as an empty table. That failure mode
// shipped once already (PR #338: a missing gateway prefix 404'd every admin
// shipment request and the UI showed "no shipments"), so the booking surfaces
// distinguish "nothing matched" from "we could not ask".
export function QueryError({
  title,
  error,
  onRetry,
}: {
  title: string;
  error?: unknown;
  onRetry?: () => void;
}) {
  const detail = extractMessage(error);
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-2 py-12 px-4 text-center"
    >
      <p className="text-destructive font-medium">{title}</p>
      {detail && <p className="text-taupe text-sm max-w-md">{detail}</p>}
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-1">
          Retry
        </Button>
      )}
    </div>
  );
}

// Axios surfaces the API's own message at response.data.message; fall back to
// the transport error so a 404 from a missing gateway prefix still says
// something more useful than "failed".
function extractMessage(error: unknown): string | null {
  if (!error) return null;
  const e = error as {
    response?: { status?: number; data?: { message?: string } };
    message?: string;
  };
  const apiMessage = e.response?.data?.message;
  if (apiMessage) return apiMessage;
  if (e.response?.status) return `Request failed with status ${e.response.status}.`;
  return e.message ?? null;
}
