import type { MappingField, MappingSpec } from "@/lib/integrations/spec-types";

export interface MapperState {
  spec: MappingSpec;
  isEnabled: boolean;
  isDirty: boolean;
  // Stable per-field IDs the UI uses as React keys. Index aligns with spec.fields.
  fieldIds: string[];
}

export type MapperAction =
  | { type: "INIT"; spec: MappingSpec; isEnabled: boolean }
  | { type: "SET_ENABLED"; isEnabled: boolean }
  | { type: "ADD_FIELD"; sourcePath?: string }
  | { type: "REMOVE_FIELD"; index: number }
  | { type: "UPDATE_FIELD"; index: number; field: MappingField }
  | { type: "SET_FIELD_SOURCE"; index: number; sourcePath: string }
  | { type: "MARK_PRISTINE" };

export function initialMapperState(spec: MappingSpec, isEnabled: boolean): MapperState {
  return {
    spec,
    isEnabled,
    isDirty: false,
    fieldIds: spec.fields.map(() => makeId()),
  };
}

let _idCounter = 0;
function makeId(): string {
  _idCounter += 1;
  return `f_${_idCounter}_${Math.random().toString(36).slice(2, 7)}`;
}

export function mapperReducer(state: MapperState, action: MapperAction): MapperState {
  switch (action.type) {
    case "INIT":
      return initialMapperState(action.spec, action.isEnabled);

    case "SET_ENABLED":
      return { ...state, isEnabled: action.isEnabled, isDirty: true };

    case "ADD_FIELD": {
      const targetGuess = action.sourcePath ? lastSegment(action.sourcePath) : "";
      const newField: MappingField = {
        target: targetGuess,
        source: action.sourcePath,
      };
      return {
        ...state,
        spec: { ...state.spec, fields: [...state.spec.fields, newField] },
        fieldIds: [...state.fieldIds, makeId()],
        isDirty: true,
      };
    }

    case "REMOVE_FIELD":
      return {
        ...state,
        spec: { ...state.spec, fields: state.spec.fields.filter((_, i) => i !== action.index) },
        fieldIds: state.fieldIds.filter((_, i) => i !== action.index),
        isDirty: true,
      };

    case "UPDATE_FIELD":
      return {
        ...state,
        spec: {
          ...state.spec,
          fields: state.spec.fields.map((f, i) => (i === action.index ? action.field : f)),
        },
        isDirty: true,
      };

    case "SET_FIELD_SOURCE": {
      // If index is past the end, append a new field. Otherwise overwrite source.
      if (action.index >= state.spec.fields.length) {
        return mapperReducer(state, { type: "ADD_FIELD", sourcePath: action.sourcePath });
      }
      const cur = state.spec.fields[action.index];
      if (!cur) return state;
      const updated: MappingField = { ...cur, source: action.sourcePath };
      return {
        ...state,
        spec: {
          ...state.spec,
          fields: state.spec.fields.map((f, i) => (i === action.index ? updated : f)),
        },
        isDirty: true,
      };
    }

    case "MARK_PRISTINE":
      return { ...state, isDirty: false };
  }
}

export function lastSegment(path: string): string {
  const parts = path.split(".");
  return parts[parts.length - 1] ?? path;
}
