import { describe, expect, test } from "bun:test";
import type { BulkImportJob } from "@materialhub/database";
import type { JobType, ParseOptions } from "../../types/job-type.ts";
import { effectiveParseOptions } from "../parse-options.ts";

const STATIC: ParseOptions = {
  expectedSheets: ["Products"],
  requiredColumnsPerSheet: { Products: ["name", "price"] },
};

function fakeJobType(over: Partial<JobType<unknown>> = {}): JobType<unknown> {
  return {
    key: "fake",
    parseOptions: STATIC,
    ...over,
  } as JobType<unknown>;
}

describe("effectiveParseOptions", () => {
  test("returns static parseOptions when no resolver", () => {
    const jt = fakeJobType();
    expect(effectiveParseOptions(jt, {} as BulkImportJob)).toBe(STATIC);
  });

  test("returns resolver output when present", () => {
    const relaxed: ParseOptions = {
      expectedSheets: ["Products"],
      requiredColumnsPerSheet: { Products: [] },
    };
    const jt = fakeJobType({ resolveParseOptions: () => relaxed });
    expect(effectiveParseOptions(jt, {} as BulkImportJob)).toBe(relaxed);
  });
});
