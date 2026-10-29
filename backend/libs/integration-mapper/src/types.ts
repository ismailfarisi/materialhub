export interface MappingField {
  target: string; // dotted output path
  source?: string; // dotted input path
  value_map?: Record<string, unknown>; // applied to result of source
  default?: unknown; // fallback when source is null/missing and value_map doesn't hit
  expression?: string; // single function call, e.g. "formatDate(value, 'YYYY-MM-DD')"
}

export interface MappingSpec {
  version: 1;
  constants?: Record<string, unknown>;
  fields: MappingField[];
}

export class MappingError extends Error {
  constructor(
    public field: string,
    public reason: string,
    public path?: string,
  ) {
    super(`mapping field '${field}': ${reason}${path ? ` (at ${path})` : ""}`);
    this.name = "MappingError";
  }
}
