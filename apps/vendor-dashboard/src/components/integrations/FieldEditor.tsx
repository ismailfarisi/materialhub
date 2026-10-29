"use client";

import type { MappingField } from "@/lib/integrations/spec-types";
import { EXPRESSION_FUNCTIONS } from "@/lib/integrations/spec-types";
import { Plus, X } from "@phosphor-icons/react";
import { useState } from "react";

type Mode = "source" | "value_map" | "expression";

function inferMode(f: MappingField): Mode {
  if (f.expression) return "expression";
  if (f.value_map) return "value_map";
  return "source";
}

interface FieldEditorProps {
  field: MappingField;
  onChange: (next: MappingField) => void;
}

export function FieldEditor({ field, onChange }: FieldEditorProps) {
  const [mode, setMode] = useState<Mode>(inferMode(field));

  function setModeAndClear(m: Mode) {
    setMode(m);
    if (m === "source") {
      onChange({ ...field, expression: undefined, value_map: undefined });
    } else if (m === "value_map") {
      onChange({ ...field, expression: undefined, value_map: field.value_map ?? {} });
    } else {
      onChange({ ...field, value_map: undefined, expression: field.expression ?? "" });
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        {(["source", "value_map", "expression"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setModeAndClear(m)}
            className={[
              "rounded-xs px-2 py-1 text-[10px] uppercase tracking-wide transition-colors duration-200 ease-out",
              mode === m ? "bg-amber text-espresso" : "bg-pearl/30 text-taupe hover:text-cacao",
            ].join(" ")}
          >
            {m === "value_map" ? "MAP" : m === "expression" ? "EXPR" : "SRC"}
          </button>
        ))}
      </div>

      {mode === "source" && (
        <div className="space-y-2">
          <input
            value={field.source ?? ""}
            onChange={(e) => onChange({ ...field, source: e.target.value || undefined })}
            placeholder="source.path"
            className="w-full font-mono text-xs rounded-xs border border-pearl/40 bg-linen px-2 py-1.5 text-cacao placeholder:text-taupe focus:border-amber focus:outline-none transition-colors duration-200"
          />
          <input
            value={String(field.default ?? "")}
            onChange={(e) =>
              onChange({ ...field, default: e.target.value === "" ? undefined : e.target.value })
            }
            placeholder="default fallback (optional)"
            className="w-full text-xs rounded-xs border border-pearl/40 bg-linen px-2 py-1.5 text-cacao placeholder:text-taupe focus:border-amber focus:outline-none transition-colors duration-200"
          />
        </div>
      )}

      {mode === "value_map" && (
        <div className="space-y-2">
          <input
            value={field.source ?? ""}
            onChange={(e) => onChange({ ...field, source: e.target.value || undefined })}
            placeholder="source.path"
            className="w-full font-mono text-xs rounded-xs border border-pearl/40 bg-linen px-2 py-1.5 text-cacao placeholder:text-taupe focus:border-amber focus:outline-none"
          />
          <ValueMapEditor
            value={(field.value_map ?? {}) as Record<string, unknown>}
            onChange={(value_map) => onChange({ ...field, value_map })}
          />
        </div>
      )}

      {mode === "expression" && (
        <div className="space-y-2">
          <select
            value={field.expression?.split("(")[0] ?? ""}
            onChange={(e) => {
              const fn = EXPRESSION_FUNCTIONS.find((x) => x.name === e.target.value);
              onChange({ ...field, expression: fn?.signature ?? "" });
            }}
            className="w-full text-xs rounded-xs border border-pearl/40 bg-linen px-2 py-1.5 text-cacao focus:border-amber focus:outline-none"
          >
            <option value="">— pick a function —</option>
            {EXPRESSION_FUNCTIONS.map((fn) => (
              <option key={fn.name} value={fn.name}>
                {fn.name} — {fn.signature}
              </option>
            ))}
          </select>
          <input
            value={field.expression ?? ""}
            onChange={(e) => onChange({ ...field, expression: e.target.value })}
            placeholder="formatDate(value, 'YYYY-MM-DD')"
            className="w-full font-mono text-xs rounded-xs border border-pearl/40 bg-linen px-2 py-1.5 text-cacao placeholder:text-taupe focus:border-amber focus:outline-none"
          />
        </div>
      )}
    </div>
  );
}

function ValueMapEditor({
  value,
  onChange,
}: {
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const entries = Object.entries(value);
  return (
    <div className="space-y-1.5">
      {entries.map(([k, v], i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: key would otherwise be the mutable "from" value; remounts the row and loses input focus on each keystroke.
          key={i}
          className="flex items-center gap-1.5"
        >
          <input
            value={k}
            onChange={(e) => {
              const next = { ...value };
              delete next[k];
              next[e.target.value] = v;
              onChange(next);
            }}
            placeholder="from"
            className="flex-1 font-mono text-xs rounded-xs border border-pearl/40 bg-linen px-2 py-1 text-cacao placeholder:text-taupe focus:border-amber focus:outline-none"
          />
          <span className="text-xs text-taupe">→</span>
          <input
            value={String(v)}
            onChange={(e) => onChange({ ...value, [k]: e.target.value })}
            placeholder="to"
            className="flex-1 font-mono text-xs rounded-xs border border-pearl/40 bg-linen px-2 py-1 text-cacao placeholder:text-taupe focus:border-amber focus:outline-none"
          />
          <button
            type="button"
            aria-label="Remove row"
            onClick={() => {
              const next = { ...value };
              delete next[k];
              onChange(next);
            }}
            className="text-taupe hover:text-russet transition-colors duration-200"
          >
            <X size={12} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange({ ...value, "": "" })}
        className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-taupe hover:text-cacao transition-colors duration-200"
      >
        <Plus size={10} />
        Add row
      </button>
    </div>
  );
}
