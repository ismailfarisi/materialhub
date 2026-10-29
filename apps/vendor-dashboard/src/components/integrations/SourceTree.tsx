"use client";

import { useDraggable } from "@dnd-kit/core";

export interface SourceLeaf {
  path: string;
  type: string;
  description?: string;
}

// Recursively flattens a JSON schema's `properties` into a flat array of leaves.
// Treats arrays as leaf paths (the user references them by path). Skips deep recursion into array items.
export function flattenSchema(schema: unknown, prefix = ""): SourceLeaf[] {
  const out: SourceLeaf[] = [];
  if (!schema || typeof schema !== "object") return out;
  const s = schema as Record<string, unknown>;
  const props = s.properties as Record<string, Record<string, unknown>> | undefined;
  if (!props) return out;
  for (const [key, sub] of Object.entries(props)) {
    const path = prefix ? `${prefix}.${key}` : key;
    const subType = sub.type as string | undefined;
    if (subType === "object" && sub.properties) {
      out.push(...flattenSchema(sub, path));
    } else if (subType === "array") {
      out.push({ path, type: "array", description: sub.description as string | undefined });
    } else {
      out.push({
        path,
        type: subType ?? "any",
        description: sub.description as string | undefined,
      });
    }
  }
  return out;
}

interface SourceTreeProps {
  schema: unknown;
  isLoading?: boolean;
}

export function SourceTree({ schema, isLoading }: SourceTreeProps) {
  if (isLoading) {
    return (
      <div className="rounded-lg border border-pearl/14 bg-linen p-4">
        <p className="text-xs uppercase tracking-wide text-taupe mb-3">SOURCE FIELDS</p>
        <p className="text-xs text-taupe">Loading schema…</p>
      </div>
    );
  }
  const leaves = flattenSchema(schema);
  return (
    <div className="rounded-lg border border-pearl/14 bg-linen p-4 h-full overflow-auto">
      <p className="text-xs uppercase tracking-wide text-taupe mb-3">SOURCE FIELDS</p>
      {leaves.length === 0 ? (
        <p className="text-xs text-taupe">No fields available for this event.</p>
      ) : (
        <ul className="space-y-1">
          {leaves.map((leaf) => (
            <DraggableLeaf key={leaf.path} leaf={leaf} />
          ))}
        </ul>
      )}
    </div>
  );
}

function DraggableLeaf({ leaf }: { leaf: SourceLeaf }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `source:${leaf.path}`,
    data: { kind: "source", leaf },
  });
  return (
    <li
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={[
        "cursor-grab select-none rounded-xs px-2 py-1.5 transition-colors duration-200 ease-out",
        "hover:bg-pearl/30",
        isDragging ? "opacity-30" : "",
      ].join(" ")}
    >
      <div className="font-mono text-xs text-cacao truncate">{leaf.path}</div>
      <div className="text-[10px] uppercase tracking-wide text-taupe">{leaf.type}</div>
    </li>
  );
}
