"use client";

import type { Delivery } from "@/lib/integrations/api";
import { useDeliveries } from "@/lib/integrations/hooks";
import { INBOUND_EVENTS, OUTBOUND_EVENTS } from "@/lib/integrations/spec-types";
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@materialhub/ui";
import { Flask } from "@phosphor-icons/react";
import { useState } from "react";
import { DeliveriesTable } from "./DeliveriesTable";
import { DeliveryDetailDrawer } from "./DeliveryDetailDrawer";
import { TestFireDialog } from "./TestFireDialog";

const ALL_EVENTS = [...OUTBOUND_EVENTS, ...INBOUND_EVENTS];

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "delivered", label: "Delivered" },
  { value: "failed", label: "Failed" },
  { value: "dlq", label: "DLQ" },
  { value: "skipped", label: "Skipped" },
];

interface ActivityTabProps {
  integrationId: string;
}

export function ActivityTab({ integrationId }: ActivityTabProps) {
  const [testFireOpen, setTestFireOpen] = useState(false);
  const [selectedDelivery, setSelectedDelivery] = useState<Delivery | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Filters
  const [direction, setDirection] = useState<"all" | "outbound" | "inbound">("all");
  const [eventType, setEventType] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");

  // Cursor pagination — keep accumulated items across pages
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [pages, setPages] = useState<Delivery[][]>([]);

  const queryParams = {
    direction: direction !== "all" ? (direction as "outbound" | "inbound") : undefined,
    event_type: eventType !== "all" ? eventType : undefined,
    status: status !== "all" ? status : undefined,
    cursor,
    limit: 20,
  };

  const { data, isFetching } = useDeliveries(integrationId, queryParams);

  // Merge latest page into accumulated pages list
  const currentItems = data?.items ?? [];
  const next_cursor = data?.next_cursor ?? null;

  // Accumulated list: all previous pages + current page
  const allDeliveries = pages.length === 0 ? currentItems : [...pages.flat(), ...currentItems];

  function handleLoadMore() {
    if (!next_cursor) return;
    // save current page
    setPages((prev) => [...prev, currentItems]);
    setCursor(next_cursor);
  }

  function handleFilterChange(
    newDirection: typeof direction,
    newEventType: string,
    newStatus: string,
  ) {
    setDirection(newDirection);
    setEventType(newEventType);
    setStatus(newStatus);
    // Reset pagination on filter change
    setCursor(undefined);
    setPages([]);
  }

  function handleSelectDelivery(d: Delivery) {
    setSelectedDelivery(d);
    setDrawerOpen(true);
  }

  // Deduplicate by id for display
  const displayDeliveries = Array.from(new Map(allDeliveries.map((d) => [d.id, d])).values());

  return (
    <div>
      {/* Top bar */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-taupe">Delivery Log</h2>
        <Button
          onClick={() => setTestFireOpen(true)}
          className="bg-amber text-cacao hover:bg-amber/90 text-xs uppercase tracking-wide"
          size="sm"
        >
          <Flask size={14} className="mr-1.5" />
          Test Fire
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-5 flex-wrap">
        <Select
          value={direction}
          onValueChange={(v) => handleFilterChange(v as typeof direction, eventType, status)}
        >
          <SelectTrigger className="w-36 text-xs">
            <SelectValue placeholder="Direction" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All directions</SelectItem>
            <SelectItem value="outbound">Outbound</SelectItem>
            <SelectItem value="inbound">Inbound</SelectItem>
          </SelectContent>
        </Select>

        <Select value={eventType} onValueChange={(v) => handleFilterChange(direction, v, status)}>
          <SelectTrigger className="w-52 text-xs">
            <SelectValue placeholder="Event type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All events</SelectItem>
            {ALL_EVENTS.map((et) => (
              <SelectItem key={et} value={et}>
                <span className="font-mono text-xs">{et}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={status} onValueChange={(v) => handleFilterChange(direction, eventType, v)}>
          <SelectTrigger className="w-40 text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <DeliveriesTable
        deliveries={displayDeliveries}
        onSelect={handleSelectDelivery}
        isLoading={isFetching && pages.length === 0}
      />

      {/* Load more */}
      {next_cursor && !isFetching && (
        <div className="flex justify-center mt-5">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLoadMore}
            className="text-taupe hover:text-cacao text-xs uppercase tracking-wide"
          >
            Load more
          </Button>
        </div>
      )}
      {isFetching && pages.length > 0 && (
        <div className="flex justify-center mt-5 text-taupe text-xs">Loading…</div>
      )}

      {/* Dialogs / Drawer */}
      <TestFireDialog
        integrationId={integrationId}
        open={testFireOpen}
        onOpenChange={setTestFireOpen}
      />
      <DeliveryDetailDrawer
        delivery={selectedDelivery}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
      />
    </div>
  );
}
