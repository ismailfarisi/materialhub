import { describe, expect, test } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import { InitiateUploadBody } from "../bulk.dto.ts";

const base = {
  jobType: "catalog_import",
  fileName: "f.csv",
  fileSizeBytes: 1024,
  fileFormat: "csv",
};

describe("InitiateUploadBody.mode", () => {
  test("accepts mode: update", () => {
    expect(Value.Check(InitiateUploadBody, { ...base, mode: "update" })).toBe(true);
  });
  test("accepts mode: upsert", () => {
    expect(Value.Check(InitiateUploadBody, { ...base, mode: "upsert" })).toBe(true);
  });
  test("accepts a body with no mode (optional)", () => {
    expect(Value.Check(InitiateUploadBody, base)).toBe(true);
  });
  test("rejects an invalid mode", () => {
    expect(Value.Check(InitiateUploadBody, { ...base, mode: "delete" })).toBe(false);
  });
});
