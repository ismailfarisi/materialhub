import type { SiteSetting } from "@materialhub/database";
import { IntegrationEventType } from "@materialhub/database/src/enums/integration.enums.ts";
import {
  type IntegrationEventJob,
  emitIntegrationEvent as enqueue,
} from "@materialhub/integration-events";
import type { Queue } from "bullmq";
import type { Repository } from "typeorm";

const FLAG_KEY = "vendor_integrations_outbound_enabled";

export async function emitIfEnabled(
  queue: Queue,
  siteSettingRepo: Repository<SiteSetting>,
  job: IntegrationEventJob,
): Promise<void> {
  const row = await siteSettingRepo.findOne({ where: { key: FLAG_KEY } as any });
  if (row?.value !== "true") return;
  await enqueue(queue, job);
}

export { IntegrationEventType };
