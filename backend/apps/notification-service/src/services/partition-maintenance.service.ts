import { AppDataSource } from "@materialhub/database";

const MAINTENANCE_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

export class PartitionMaintenanceService {
  private timer: ReturnType<typeof setInterval> | null = null;

  start() {
    // Run once on startup, then every 24 hours
    this.runMaintenance();
    this.timer = setInterval(() => this.runMaintenance(), MAINTENANCE_INTERVAL_MS);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async runMaintenance(): Promise<void> {
    try {
      await AppDataSource.query("SELECT create_next_notification_partition()");
      await AppDataSource.query("SELECT drop_old_notification_partitions()");
      console.log("[partition-maintenance] Notification partition maintenance completed");
    } catch (err) {
      console.error("[partition-maintenance] Failed to run partition maintenance:", err);
    }
  }
}
