import type { IntegrationEventType } from "@materialhub/database";
import type { Queue } from "bullmq";

export interface IntegrationEventJob {
  event_type: IntegrationEventType;
  vendor_id: string;
  payload: Record<string, unknown>;
  source_ref: Record<string, unknown>;
  schema_version: number;
}

export async function emitIntegrationEvent(queue: Queue, job: IntegrationEventJob): Promise<void> {
  await queue.add("emit", job);
}
