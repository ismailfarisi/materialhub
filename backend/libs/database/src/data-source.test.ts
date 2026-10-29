import { describe, expect, it } from "bun:test";
import { AppDataSource } from "./data-source.ts";
import * as barrel from "./entities/index.ts";

describe("AppDataSource entity registration", () => {
  it("registers every entity exported from entities/index.ts", () => {
    const barrelNames = new Set(Object.keys(barrel));
    const registeredNames = new Set(
      (AppDataSource.options.entities as Array<{ name: string }>).map((e) => e.name),
    );
    const missing = [...barrelNames].filter((n) => !registeredNames.has(n));
    expect(missing).toEqual([]);
  });
});
