import { parseExpression } from "./expressions.ts";
import type { MappingSpec } from "./types.ts";

export function validateSpec(spec: unknown): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!spec || typeof spec !== "object") {
    return { ok: false, errors: ["spec must be an object"] };
  }
  const s = spec as MappingSpec;
  if (s.version !== 1) errors.push("spec.version must be 1");
  if (!Array.isArray(s.fields)) errors.push("spec.fields must be an array");
  if (s.constants !== undefined && (typeof s.constants !== "object" || s.constants === null)) {
    errors.push("spec.constants must be an object");
  }
  if (Array.isArray(s.fields)) {
    s.fields.forEach((f, i) => {
      if (!f || typeof f !== "object") {
        errors.push(`fields[${i}] must be an object`);
        return;
      }
      if (typeof f.target !== "string" || f.target.length === 0) {
        errors.push(`fields[${i}].target is required`);
      }
      const hasSource = typeof f.source === "string";
      const hasExpr = typeof f.expression === "string";
      if (!hasSource && !hasExpr) {
        errors.push(`fields[${i}] must have at least source or expression`);
      }
      if (hasExpr) {
        try {
          parseExpression(f.expression as string);
        } catch (e) {
          errors.push(`fields[${i}].expression: ${(e as Error).message}`);
        }
      }
    });
  }
  return { ok: errors.length === 0, errors };
}
