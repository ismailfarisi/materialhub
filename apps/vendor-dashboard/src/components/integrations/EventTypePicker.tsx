"use client";

import type { Mapping } from "@/lib/integrations/api";
import {
  type Direction,
  type EventType,
  INBOUND_EVENTS,
  OUTBOUND_EVENTS,
} from "@/lib/integrations/spec-types";
import { Skeleton } from "@materialhub/ui";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function humanizeEventType(et: string): string {
  // "vendor_order.created" -> "Vendor Order Created"
  return et
    .split(/[._]/)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
}

// ─── EventLabel ───────────────────────────────────────────────────────────────

function EventLabel({ eventType }: { eventType: EventType }) {
  return <span className="text-base font-semibold text-cacao">{humanizeEventType(eventType)}</span>;
}

// ─── StatusPill ───────────────────────────────────────────────────────────────

function StatusPill({ mapping }: { mapping: Mapping | undefined }) {
  if (!mapping) {
    // Empty placeholder to keep card heights consistent
    return <span className="block h-4" />;
  }

  if (mapping.is_enabled) {
    return <span className="text-xs uppercase tracking-wide text-amber">● Configured</span>;
  }

  return <span className="text-xs uppercase tracking-wide text-taupe">● Paused</span>;
}

// ─── EventCard ────────────────────────────────────────────────────────────────

interface EventCardProps {
  eventType: EventType;
  direction: Direction;
  mapping: Mapping | undefined;
  onSelect: (direction: Direction, eventType: EventType) => void;
}

function EventCard({ eventType, direction, mapping, onSelect }: EventCardProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(direction, eventType)}
      className="rounded-lg border border-pearl/14 bg-linen p-5 cursor-pointer transition-all duration-200 ease-out hover:border-pearl/40 hover:bg-pearl/10 active:scale-[0.99] text-left w-full"
    >
      <div className="flex flex-col gap-1">
        <EventLabel eventType={eventType} />
        <span className="font-mono text-xs text-taupe">{eventType}</span>
      </div>
      <div className="mt-4">
        <StatusPill mapping={mapping} />
      </div>
    </button>
  );
}

// ─── Skeleton loader ──────────────────────────────────────────────────────────

function PickerSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-28 rounded-lg" />
      ))}
    </div>
  );
}

// ─── EventTypePicker ─────────────────────────────────────────────────────────

interface EventTypePickerProps {
  mappings: Mapping[];
  isLoading: boolean;
  onSelect: (direction: Direction, eventType: EventType) => void;
}

export function EventTypePicker({ mappings, isLoading, onSelect }: EventTypePickerProps) {
  function findMapping(direction: Direction, eventType: EventType): Mapping | undefined {
    return mappings.find((m) => m.direction === direction && m.event_type === eventType);
  }

  return (
    <div>
      {/* ── OUTBOUND ─────────────────────────────────────── */}
      <div>
        <p className="text-xs uppercase tracking-wide text-taupe">Outbound Events</p>
        <p className="mt-1 text-sm text-cacao/70">
          Pick an event to configure how its payload is shaped before being POSTed to your outbound
          URL.
        </p>

        <div className="mt-4">
          {isLoading ? (
            <PickerSkeleton />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {OUTBOUND_EVENTS.map((et) => (
                <EventCard
                  key={et}
                  eventType={et}
                  direction="outbound"
                  mapping={findMapping("outbound", et)}
                  onSelect={onSelect}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Divider ──────────────────────────────────────── */}
      <div className="h-px w-full bg-pearl/14 my-12" />

      {/* ── INBOUND ──────────────────────────────────────── */}
      <div>
        <p className="text-xs uppercase tracking-wide text-taupe">Inbound Events</p>
        <p className="mt-1 text-sm text-cacao/70">
          Pick an event your partner can send to be applied to your store.
        </p>

        <div className="mt-4">
          {isLoading ? (
            <PickerSkeleton />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {INBOUND_EVENTS.map((et) => (
                <EventCard
                  key={et}
                  eventType={et}
                  direction="inbound"
                  mapping={findMapping("inbound", et)}
                  onSelect={onSelect}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
