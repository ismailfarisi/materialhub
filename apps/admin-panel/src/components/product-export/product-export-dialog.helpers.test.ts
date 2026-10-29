import { describe, expect, test } from "vitest";
import { getEffectiveFieldGroups, toggleFieldGroup } from "./product-export-dialog.helpers";

describe("product export dialog helpers", () => {
  const preset = {
    key: "catalog_overview" as const,
    label: "Catalog overview",
    defaultFieldGroups: ["identity", "pricing", "status"],
  };

  test("uses preset default groups until a manual selection exists", () => {
    expect(getEffectiveFieldGroups([], preset)).toEqual(["identity", "pricing", "status"]);
    expect(getEffectiveFieldGroups(["inventory"], preset)).toEqual(["inventory"]);
  });

  test("toggles from the visible default groups when the user changes a preset", () => {
    expect(toggleFieldGroup([], preset, "pricing")).toEqual(["identity", "status"]);
    expect(toggleFieldGroup([], preset, "inventory")).toEqual([
      "identity",
      "pricing",
      "status",
      "inventory",
    ]);
  });
});
