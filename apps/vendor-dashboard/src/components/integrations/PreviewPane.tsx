"use client";

import type { MappingSpec } from "@/lib/integrations/spec-types";

interface PreviewPaneProps {
  spec: MappingSpec;
  sampleSource: unknown;
}

export function PreviewPane({ spec, sampleSource }: PreviewPaneProps) {
  const output = transformPreview(spec, sampleSource);
  const display = JSON.stringify(output, null, 2);

  return (
    <div className="rounded-lg border border-pearl/14 bg-linen p-4 h-full overflow-auto">
      <p className="text-xs uppercase tracking-wide text-taupe mb-3">PREVIEW OUTPUT</p>
      {spec.fields.length === 0 ? (
        <p className="text-xs text-taupe">Drop or add fields to see the transformed output.</p>
      ) : (
        <pre className="font-mono text-xs text-cacao whitespace-pre-wrap break-words leading-relaxed">
          {display}
        </pre>
      )}
    </div>
  );
}

// Best-effort, pure-client transform. Mirrors the mapper-server transform's
// `source path → value` and `value_map / default` shape but skips expressions.
// Used purely to give the vendor a feel for the output. The real transform
// runs in the integration-mapper server package on dispatch.
export function transformPreview(
  spec: MappingSpec,
  sourceObject: unknown,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (spec.constants) {
    for (const [k, v] of Object.entries(spec.constants)) out[k] = v;
  }
  for (const f of spec.fields) {
    if (!f.target) continue;
    let value: unknown = undefined;
    if (f.source) value = readPath(sourceObject, f.source);
    if (value === undefined && f.default !== undefined) value = f.default;
    if (f.value_map && value != null) {
      const mapped = (f.value_map as Record<string, unknown>)[String(value)];
      if (mapped !== undefined) value = mapped;
    }
    if (f.expression) value = `<expr: ${f.expression}>`;
    setPath(out, f.target, value);
  }
  return out;
}

function readPath(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in (cur as object)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return cur;
}

function setPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (key === undefined) return;
    if (typeof cur[key] !== "object" || cur[key] === null) cur[key] = {};
    cur = cur[key] as Record<string, unknown>;
  }
  const lastKey = parts[parts.length - 1];
  if (lastKey !== undefined) cur[lastKey] = value;
}
