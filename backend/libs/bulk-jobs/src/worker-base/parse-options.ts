import type { BulkImportJob } from "@materialhub/database";
import type { JobType, ParseOptions } from "../types/job-type.ts";

/** Per-job parse options: resolver override if present, else the static config. */
export function effectiveParseOptions(
  jobType: JobType<unknown, unknown>,
  job: BulkImportJob,
): ParseOptions {
  return jobType.resolveParseOptions?.(job) ?? jobType.parseOptions;
}
