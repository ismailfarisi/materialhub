import type { TemplateDescriptor } from "../types/job-type.ts";

const templates = new Map<string, TemplateDescriptor>();

export function registerTemplate(desc: TemplateDescriptor): void {
  templates.set(desc.jobType, desc);
}

export function getTemplate(jobType: string): TemplateDescriptor | null {
  return templates.get(jobType) ?? null;
}

export function listRegisteredJobTypes(): string[] {
  return [...templates.keys()];
}
