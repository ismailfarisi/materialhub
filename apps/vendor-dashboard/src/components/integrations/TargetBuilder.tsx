"use client";

import type { MappingField } from "@/lib/integrations/spec-types";
import { useDroppable } from "@dnd-kit/core";
import { Plus, Trash } from "@phosphor-icons/react";
import { FieldEditor } from "./FieldEditor";

interface TargetBuilderProps {
  fields: MappingField[];
  fieldIds: string[];
  onChange: (next: MappingField[]) => void;
}

export function TargetBuilder({ fields, fieldIds, onChange }: TargetBuilderProps) {
  const { setNodeRef, isOver } = useDroppable({ id: "target-dropzone-new" });

  function updateField(index: number, next: MappingField) {
    onChange(fields.map((f, i) => (i === index ? next : f)));
  }

  function removeField(index: number) {
    onChange(fields.filter((_, i) => i !== index));
  }

  function addEmpty() {
    onChange([...fields, { target: "" }]);
  }

  return (
    <div className="rounded-lg border border-pearl/14 bg-linen p-4 h-full overflow-auto">
      <p className="text-xs uppercase tracking-wide text-taupe mb-3">TARGET FIELDS</p>

      {fields.length === 0 ? null : (
        <ul className="space-y-3">
          {fields.map((f, i) => (
            <FieldRow
              key={fieldIds[i] ?? `idx-${i}`}
              index={i}
              field={f}
              onUpdate={(updated) => updateField(i, updated)}
              onRemove={() => removeField(i)}
            />
          ))}
        </ul>
      )}

      <div
        ref={setNodeRef}
        className={[
          "mt-4 rounded-md border-2 border-dashed p-6 text-center transition-colors duration-200 ease-out",
          isOver ? "border-amber bg-amber/5" : "border-pearl/40",
        ].join(" ")}
      >
        <p className="text-xs uppercase tracking-wide text-taupe">
          {isOver ? "Release to add field" : "Drop a source field here"}
        </p>
      </div>

      <button
        type="button"
        onClick={addEmpty}
        className="mt-3 inline-flex items-center gap-1.5 text-xs uppercase tracking-wide text-taupe hover:text-cacao transition-colors duration-200"
      >
        <Plus size={12} />
        Add empty field
      </button>
    </div>
  );
}

function FieldRow({
  index,
  field,
  onUpdate,
  onRemove,
}: {
  index: number;
  field: MappingField;
  onUpdate: (f: MappingField) => void;
  onRemove: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `target-row-${index}` });
  return (
    <li
      ref={setNodeRef}
      className={[
        "rounded-md border bg-linen p-3 transition-colors duration-200 ease-out",
        isOver ? "border-amber bg-amber/5" : "border-pearl/14",
      ].join(" ")}
    >
      <div className="flex items-center gap-2 mb-2">
        <input
          value={field.target}
          onChange={(e) => onUpdate({ ...field, target: e.target.value })}
          placeholder="target.path"
          className="flex-1 font-mono text-sm border-b border-pearl/40 bg-transparent text-cacao placeholder:text-taupe focus:border-amber focus:outline-none transition-colors duration-200"
        />
        <button
          type="button"
          aria-label="Remove field"
          onClick={onRemove}
          className="text-taupe hover:text-russet transition-colors duration-200"
        >
          <Trash size={14} />
        </button>
      </div>
      <FieldEditor field={field} onChange={onUpdate} />
    </li>
  );
}
