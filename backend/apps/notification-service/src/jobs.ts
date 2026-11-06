import { PartitionMaintenanceService } from "./services/partition-maintenance.service.ts";

/**
 * Background work owned by the notification module. Called once by the
 * monolith at boot. (The dispatch and event-consumer BullMQ workers are
 * created when ./container.ts is imported, as before.)
 */
export function startNotificationJobs(): void {
  // Creates future partitions, drops old ones.
  const partitionMaintenance = new PartitionMaintenanceService();
  partitionMaintenance.start();
}
