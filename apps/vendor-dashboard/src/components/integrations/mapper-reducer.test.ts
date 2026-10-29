import { describe, expect, test } from "bun:test";
import { initialMapperState, lastSegment, mapperReducer } from "./mapper-reducer";

describe("mapper-reducer", () => {
  const baseSpec = { version: 1 as const, fields: [] };

  test("INIT replaces state and clears isDirty", () => {
    const s = initialMapperState({ version: 1, fields: [{ target: "a" }] }, true);
    const next = mapperReducer(s, { type: "INIT", spec: baseSpec, isEnabled: false });
    expect(next.spec.fields).toEqual([]);
    expect(next.isEnabled).toBe(false);
    expect(next.isDirty).toBe(false);
  });

  test("ADD_FIELD with sourcePath suggests target from last segment", () => {
    const s = initialMapperState(baseSpec, true);
    const next = mapperReducer(s, { type: "ADD_FIELD", sourcePath: "vendor_order.items.sku" });
    expect(next.spec.fields).toHaveLength(1);
    expect(next.spec.fields[0]).toEqual({ target: "sku", source: "vendor_order.items.sku" });
    expect(next.fieldIds).toHaveLength(1);
    expect(next.isDirty).toBe(true);
  });

  test("ADD_FIELD without sourcePath adds an empty field", () => {
    const s = initialMapperState(baseSpec, true);
    const next = mapperReducer(s, { type: "ADD_FIELD" });
    expect(next.spec.fields[0]).toEqual({ target: "", source: undefined });
    expect(next.isDirty).toBe(true);
  });

  test("REMOVE_FIELD drops the right index and keeps fieldIds aligned", () => {
    const s0 = initialMapperState(
      { version: 1, fields: [{ target: "a" }, { target: "b" }, { target: "c" }] },
      true,
    );
    const s1 = mapperReducer(s0, { type: "REMOVE_FIELD", index: 1 });
    expect(s1.spec.fields).toEqual([{ target: "a" }, { target: "c" }]);
    expect(s1.fieldIds).toHaveLength(2);
    expect(s1.fieldIds[0]).toBe(s0.fieldIds[0]);
    expect(s1.fieldIds[1]).toBe(s0.fieldIds[2]);
  });

  test("UPDATE_FIELD replaces in-place and preserves fieldId", () => {
    const s0 = initialMapperState({ version: 1, fields: [{ target: "a" }] }, true);
    const s1 = mapperReducer(s0, {
      type: "UPDATE_FIELD",
      index: 0,
      field: { target: "a", expression: "toUpper(value)" },
    });
    expect(s1.spec.fields[0]).toEqual({ target: "a", expression: "toUpper(value)" });
    expect(s1.fieldIds).toEqual(s0.fieldIds);
  });

  test("SET_FIELD_SOURCE on existing index sets source only", () => {
    const s0 = initialMapperState({ version: 1, fields: [{ target: "x" }] }, true);
    const s1 = mapperReducer(s0, {
      type: "SET_FIELD_SOURCE",
      index: 0,
      sourcePath: "vendor.email",
    });
    expect(s1.spec.fields[0]).toEqual({ target: "x", source: "vendor.email" });
  });

  test("SET_FIELD_SOURCE past the end appends a new field", () => {
    const s0 = initialMapperState(baseSpec, true);
    const s1 = mapperReducer(s0, { type: "SET_FIELD_SOURCE", index: 99, sourcePath: "vendor.id" });
    expect(s1.spec.fields).toHaveLength(1);
    expect(s1.spec.fields[0]).toEqual({ target: "id", source: "vendor.id" });
  });

  test("SET_ENABLED toggles and marks dirty", () => {
    const s0 = initialMapperState(baseSpec, true);
    const s1 = mapperReducer(s0, { type: "SET_ENABLED", isEnabled: false });
    expect(s1.isEnabled).toBe(false);
    expect(s1.isDirty).toBe(true);
  });

  test("MARK_PRISTINE clears isDirty without other changes", () => {
    const s0 = initialMapperState(baseSpec, true);
    const dirty = mapperReducer(s0, { type: "ADD_FIELD" });
    expect(dirty.isDirty).toBe(true);
    const cleaned = mapperReducer(dirty, { type: "MARK_PRISTINE" });
    expect(cleaned.isDirty).toBe(false);
    expect(cleaned.spec).toEqual(dirty.spec);
  });

  test("lastSegment helper", () => {
    expect(lastSegment("a.b.c")).toBe("c");
    expect(lastSegment("plain")).toBe("plain");
    expect(lastSegment("")).toBe("");
  });
});
