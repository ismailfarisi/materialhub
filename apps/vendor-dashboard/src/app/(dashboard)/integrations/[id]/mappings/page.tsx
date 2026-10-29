"use client";

import { EventTypePicker } from "@/components/integrations/EventTypePicker";
import { MapperEditor } from "@/components/integrations/MapperEditor";
import { useMappings } from "@/lib/integrations/hooks";
import type { Direction, EventType } from "@/lib/integrations/spec-types";
import { useParams, useRouter, useSearchParams } from "next/navigation";

export default function MappingsPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const search = useSearchParams();
  const router = useRouter();

  const eventType = (search.get("event_type") ?? null) as EventType | null;
  const direction = (search.get("direction") ?? null) as Direction | null;

  const { data: mappings, isLoading } = useMappings(id);

  // If both event_type AND direction are in the URL → show the editor
  // Otherwise → show the picker
  const editing = eventType !== null && direction !== null;

  function selectEvent(d: Direction, e: EventType) {
    router.push(`/integrations/${id}/mappings?direction=${d}&event_type=${e}`);
  }

  function backToPicker() {
    router.push(`/integrations/${id}/mappings`);
  }

  if (editing) {
    return (
      <MapperEditor
        integrationId={id}
        direction={direction}
        eventType={eventType}
        existingMapping={
          mappings?.find((m) => m.event_type === eventType && m.direction === direction) ?? null
        }
        onBack={backToPicker}
      />
    );
  }

  return <EventTypePicker mappings={mappings ?? []} isLoading={isLoading} onSelect={selectEvent} />;
}
