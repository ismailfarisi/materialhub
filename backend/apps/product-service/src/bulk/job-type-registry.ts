import type { JobType } from "@materialhub/bulk-jobs";

const registry = new Map<string, JobType<unknown, unknown>>();

export function registerJobType(jt: JobType<unknown, unknown>): void {
  registry.set(jt.key, jt);
}

export function getJobType(key: string): JobType<unknown, unknown> | null {
  return registry.get(key) ?? null;
}

export function isJobTypeImplemented(key: string): boolean {
  return registry.has(key);
}

export function listRegisteredJobTypes(): string[] {
  return [...registry.keys()];
}
