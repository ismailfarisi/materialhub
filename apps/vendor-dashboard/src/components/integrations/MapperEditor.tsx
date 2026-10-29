"use client";

import type { Mapping } from "@/lib/integrations/api";
import { useSourceSchema, useUpsertMapping } from "@/lib/integrations/hooks";
import type { Direction, EventType, MappingSpec } from "@/lib/integrations/spec-types";
import { DndContext, type DragEndEvent } from "@dnd-kit/core";
import { Button, Switch, toast } from "@materialhub/ui";
import { ArrowLeft } from "@phosphor-icons/react";
import { useReducer } from "react";
import { PreviewPane } from "./PreviewPane";
import { type SourceLeaf, SourceTree } from "./SourceTree";
import { TargetBuilder } from "./TargetBuilder";
import { initialMapperState, mapperReducer } from "./mapper-reducer";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function humanizeEventType(et: string): string {
  return et
    .split(/[._]/)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
}

function sampleFromSchema(schema: unknown): Record<string, unknown> {
  if (!schema || typeof schema !== "object") return {};
  const s = schema as Record<string, unknown>;
  const examples = s.examples as unknown[] | undefined;
  if (Array.isArray(examples) && examples.length > 0 && typeof examples[0] === "object") {
    return examples[0] as Record<string, unknown>;
  }
  const props = s.properties as Record<string, Record<string, unknown>> | undefined;
  if (!props) return {};
  const out: Record<string, unknown> = {};
  for (const [key, prop] of Object.entries(props)) {
    out[key] = sampleValue(prop);
  }
  return out;
}

function sampleValue(prop: Record<string, unknown>): unknown {
  const t = prop.type as string | undefined;
  if (t === "object" && prop.properties) return sampleFromSchema(prop);
  if (t === "array") return [];
  if (t === "integer" || t === "number") return 0;
  if (t === "boolean") return false;
  if (t === "string") {
    if (prop.format === "uuid") return "00000000-0000-0000-0000-000000000000";
    if (prop.format === "date-time") return "2026-04-28T10:00:00Z";
    return "sample";
  }
  return null;
}

// ─── MapperEditor ─────────────────────────────────────────────────────────────

interface MapperEditorProps {
  integrationId: string;
  direction: Direction;
  eventType: EventType;
  existingMapping: Mapping | null;
  onBack: () => void;
}

export function MapperEditor({
  integrationId,
  direction,
  eventType,
  existingMapping,
  onBack,
}: MapperEditorProps) {
  const emptySpec: MappingSpec = { version: 1, fields: [] };
  const [state, dispatch] = useReducer(mapperReducer, undefined, () =>
    initialMapperState(existingMapping?.spec ?? emptySpec, existingMapping?.is_enabled ?? false),
  );

  const upsertMapping = useUpsertMapping(integrationId);
  const sourceSchemaQuery = useSourceSchema(integrationId, eventType);
  const sampleSource = sampleFromSchema(sourceSchemaQuery.data);

  function onDragEnd(event: DragEndEvent) {
    const sourceData = event.active.data.current as
      | { kind?: string; leaf?: SourceLeaf }
      | undefined;
    const overId = event.over?.id as string | undefined;
    if (!sourceData?.leaf || !overId) return;
    const sourcePath = sourceData.leaf.path;

    if (overId === "target-dropzone-new") {
      dispatch({ type: "ADD_FIELD", sourcePath });
      return;
    }
    const rowMatch = /^target-row-(\d+)$/.exec(overId);
    if (rowMatch) {
      const idx = Number(rowMatch[1]);
      dispatch({ type: "SET_FIELD_SOURCE", index: idx, sourcePath });
    }
  }

  async function handleSave() {
    if (state.spec.fields.length === 0 && !state.isEnabled) {
      toast({ title: "Add at least one field or enable later", variant: "destructive" });
      return;
    }
    try {
      await upsertMapping.mutateAsync({
        direction,
        event_type: eventType,
        spec: state.spec,
        is_enabled: state.isEnabled,
      });
      dispatch({ type: "MARK_PRISTINE" });
      toast({ title: "Mapping saved" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      toast({ title: msg, variant: "destructive" });
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 text-xs uppercase tracking-wide text-taupe hover:text-cacao transition-colors duration-200"
          >
            <ArrowLeft size={14} />
            Back to events
          </button>
          <p className="mt-3 text-xs uppercase tracking-wide text-taupe">{direction}</p>
          <h2 className="mt-1 text-2xl font-semibold text-cacao">{humanizeEventType(eventType)}</h2>
          <div className="mt-2 h-px w-12 bg-amber" />
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch
              id="mapper-enabled"
              checked={state.isEnabled}
              onCheckedChange={(v) => dispatch({ type: "SET_ENABLED", isEnabled: v })}
            />
            <label
              htmlFor="mapper-enabled"
              className="text-xs uppercase tracking-wide text-taupe cursor-pointer"
            >
              Enabled
            </label>
          </div>
          <Button
            type="button"
            onClick={handleSave}
            disabled={!state.isDirty || upsertMapping.isPending}
          >
            {upsertMapping.isPending ? "SAVING…" : "SAVE"}
          </Button>
        </div>
      </div>

      {/* 3-pane editor */}
      <DndContext onDragEnd={onDragEnd}>
        <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr_400px] gap-4 min-h-[500px]">
          {/* Left: source tree */}
          <SourceTree schema={sourceSchemaQuery.data} isLoading={sourceSchemaQuery.isLoading} />

          {/* Middle: target builder */}
          <TargetBuilder
            fields={state.spec.fields}
            fieldIds={state.fieldIds}
            onChange={(next) => {
              // Rebuild full spec with the new fields array, keeping each update atomic
              // by dispatching individual UPDATE_FIELD actions would be too chatty;
              // instead we replace the entire spec when TargetBuilder calls onChange.
              // This happens only on manual edits (not DnD), so we use a bulk action.
              const current = state.spec;
              // Apply each field change — simplest: re-init preserving fieldIds by
              // dispatching UPDATE_FIELD for every changed index.
              for (let i = 0; i < next.length; i++) {
                if (i < current.fields.length) {
                  if (next[i] !== current.fields[i]) {
                    dispatch({ type: "UPDATE_FIELD", index: i, field: next[i] });
                  }
                } else {
                  dispatch({ type: "ADD_FIELD" });
                }
              }
              // Handle removals
              if (next.length < current.fields.length) {
                for (let i = current.fields.length - 1; i >= next.length; i--) {
                  dispatch({ type: "REMOVE_FIELD", index: i });
                }
              }
            }}
          />

          {/* Right: preview pane */}
          <PreviewPane spec={state.spec} sampleSource={sampleSource} />
        </div>
      </DndContext>
    </div>
  );
}
