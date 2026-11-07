import { describe, expect, test } from "bun:test";
import { vendorOptionLabel } from "./vendor-picker";

describe("vendorOptionLabel", () => {
  test("uses the store name from the profile (`name`), not the id", () => {
    expect(
      vendorOptionLabel({ vid: "v-1", r: "manager" }, [{ id: "v-1", name: "Gulf Board Supplies" }], 0),
    ).toBe("Gulf Board Supplies — manager");
  });

  test("falls back to a numbered label, never the UUID", () => {
    const label = vendorOptionLabel(
      { vid: "3f2b1c9e-1111-4222-8333-444455556666", r: "staff" },
      [],
      1,
    );
    expect(label).toBe("Store 2 — staff");
  });
});
