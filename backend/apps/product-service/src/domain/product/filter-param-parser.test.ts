import { describe, expect, test } from "bun:test";
import { parseAttributeParams } from "./filter-param-parser.ts";

describe("parseAttributeParams", () => {
  const attrs = [
    {
      id: "a1",
      slug: "color",
      filter_input_type: "color_swatch",
      values: [
        { id: "v1", slug: "red" },
        { id: "v2", slug: "blue" },
      ],
    },
    {
      id: "a2",
      slug: "gender",
      filter_input_type: "radio",
      values: [
        { id: "v3", slug: "women" },
        { id: "v4", slug: "men" },
      ],
    },
    { id: "a3", slug: "weight", filter_input_type: "range", values: [] },
    { id: "a4", slug: "on_sale", filter_input_type: "toggle", values: [] },
  ];

  test("checkbox / color_swatch: comma-split into valueIds", () => {
    const out = parseAttributeParams({ color: "red,blue" }, attrs);
    expect(out).toEqual([{ kind: "checkbox", attributeId: "a1", valueIds: ["v1", "v2"] }]);
  });

  test("radio: single value maps to valueId", () => {
    const out = parseAttributeParams({ gender: "women" }, attrs);
    expect(out).toEqual([{ kind: "radio", attributeId: "a2", valueId: "v3" }]);
  });

  test("range: 'min-max' parsed with optional sides", () => {
    expect(parseAttributeParams({ weight: "100-500" }, attrs)).toEqual([
      { kind: "range", attributeSlug: "weight", min: 100, max: 500 },
    ]);
    expect(parseAttributeParams({ weight: "-500" }, attrs)).toEqual([
      { kind: "range", attributeSlug: "weight", min: undefined, max: 500 },
    ]);
    expect(parseAttributeParams({ weight: "100-" }, attrs)).toEqual([
      { kind: "range", attributeSlug: "weight", min: 100, max: undefined },
    ]);
  });

  test("toggle: 'true' → presence filter", () => {
    expect(parseAttributeParams({ on_sale: "true" }, attrs)).toEqual([
      { kind: "toggle", attributeSlug: "on_sale", value: true },
    ]);
    expect(parseAttributeParams({ on_sale: "false" }, attrs)).toEqual([]);
  });

  test("unknown params are skipped", () => {
    expect(parseAttributeParams({ nope: "x" }, attrs)).toEqual([]);
  });
});
