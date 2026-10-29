import { callExpression } from "./expressions.ts";
import { resolvePath } from "./path.ts";
import type { MappingField, MappingSpec } from "./types.ts";

export function transform(spec: MappingSpec, source: unknown): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (spec.constants) Object.assign(result, spec.constants);
  for (const field of spec.fields) {
    const value = computeField(field, source);
    setNestedPath(result, field.target, value);
  }
  return result;
}

function computeField(field: MappingField, source: unknown): unknown {
  let value: unknown = field.source !== undefined ? resolvePath(source, field.source) : undefined;
  if (field.value_map && value !== null && value !== undefined) {
    const mapped = field.value_map[String(value)];
    if (mapped !== undefined) {
      value = mapped;
    } else if (field.default !== undefined) {
      value = field.default;
    }
  } else if ((value === null || value === undefined) && field.default !== undefined) {
    value = field.default;
  }
  if (field.expression) {
    const ctx = field.source !== undefined ? { ...(source as object), value } : source;
    value = callExpression(field.expression, ctx);
  }
  return value ?? null;
}

function setNestedPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const segments = path.split(".");
  if (segments.length === 0) return;
  let current: Record<string, unknown> = target;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i] as string;
    if (typeof current[seg] !== "object" || current[seg] === null) current[seg] = {};
    current = current[seg] as Record<string, unknown>;
  }
  const last = segments[segments.length - 1] as string;
  current[last] = value;
}
