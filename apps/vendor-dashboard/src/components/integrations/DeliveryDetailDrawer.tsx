"use client";

import type { Delivery } from "@/lib/integrations/api";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@materialhub/ui";

interface DeliveryDetailDrawerProps {
  delivery: Delivery | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function statusColors(status: Delivery["status"]): string {
  switch (status) {
    case "delivered":
      return "bg-amber/20 text-amber border border-amber/40";
    case "failed":
    case "dlq":
      return "bg-russet/10 text-russet border border-russet/30";
    case "skipped":
      return "bg-taupe/10 text-taupe border border-taupe/20";
    default:
      return "bg-pearl/10 text-taupe border border-pearl/20";
  }
}

function directionColors(direction: Delivery["direction"]): string {
  if (direction === "outbound") return "bg-amber/20 text-amber border border-amber/30";
  return "bg-taupe/10 text-taupe border border-taupe/20";
}

function SectionLabel({ label }: { label: string }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-widest text-taupe mb-2 mt-6 first:mt-0">
      {label}
    </p>
  );
}

function MonoBlock({ content }: { content: string }) {
  return (
    <pre className="bg-linen border border-pearl/14 rounded-lg p-3 font-mono text-xs text-cacao whitespace-pre-wrap break-words leading-relaxed overflow-auto max-h-48">
      {content}
    </pre>
  );
}

function prettyJson(val: unknown): string {
  if (val === null || val === undefined) return "—";
  if (typeof val === "string") {
    try {
      return JSON.stringify(JSON.parse(val), null, 2);
    } catch {
      return val;
    }
  }
  try {
    return JSON.stringify(val, null, 2);
  } catch {
    return String(val);
  }
}

export function DeliveryDetailDrawer({ delivery, open, onOpenChange }: DeliveryDetailDrawerProps) {
  if (!delivery) return null;

  const headers = delivery.signed_headers ?? {};

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto bg-pearl text-cacao">
        <SheetHeader className="mb-4">
          <SheetTitle className="font-mono text-sm text-cacao">{delivery.event_type}</SheetTitle>
          <div className="flex gap-2 mt-2 flex-wrap">
            <span
              className={[
                "text-xs uppercase tracking-wide font-medium px-2 py-0.5 rounded-sm",
                directionColors(delivery.direction),
              ].join(" ")}
            >
              {delivery.direction}
            </span>
            <span
              className={[
                "text-xs uppercase tracking-wide font-medium px-2 py-0.5 rounded-sm",
                statusColors(delivery.status),
              ].join(" ")}
            >
              {delivery.status}
            </span>
            {delivery.status_code !== null && (
              <span className="text-xs font-mono bg-linen border border-pearl/14 px-2 py-0.5 rounded-sm text-cacao">
                HTTP {delivery.status_code}
              </span>
            )}
          </div>
        </SheetHeader>

        <div className="space-y-1 pb-8">
          <SectionLabel label="Request" />
          <MonoBlock content={prettyJson(delivery.request_body)} />

          <SectionLabel label="Signed Headers" />
          {Object.keys(headers).length === 0 ? (
            <p className="text-xs text-taupe font-mono">—</p>
          ) : (
            <div className="border border-pearl/14 rounded-lg overflow-hidden">
              <table className="w-full text-xs font-mono">
                <tbody>
                  {Object.entries(headers).map(([k, v]) => (
                    <tr key={k} className="border-b border-pearl/10 last:border-0">
                      <td className="px-3 py-2 text-taupe bg-linen w-2/5 break-all">{k}</td>
                      <td className="px-3 py-2 text-cacao break-all">{String(v)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <SectionLabel label="Response" />
          {delivery.status_code !== null && (
            <p className="text-xs text-taupe mb-1">
              Status: <span className="font-mono text-cacao">{delivery.status_code}</span>
            </p>
          )}
          <MonoBlock content={delivery.response_body ?? "—"} />

          <SectionLabel label="Metadata" />
          <div className="space-y-1 text-xs">
            <div className="flex gap-2">
              <span className="text-taupe w-28 shrink-0">Attempts</span>
              <span className="font-mono text-cacao">{delivery.attempts}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-taupe w-28 shrink-0">Created at</span>
              <span className="font-mono text-cacao">
                {new Date(delivery.created_at).toLocaleString()}
              </span>
            </div>
            {delivery.error_message && (
              <div className="flex gap-2 mt-2">
                <span className="text-taupe w-28 shrink-0">Error</span>
                <span className="font-mono text-russet break-all">{delivery.error_message}</span>
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
