import { config } from "@materialhub/config";
import { ensureDatabase } from "@materialhub/database";
import { permissionMatrix } from "@materialhub/guards";
import { app } from "./app.ts";
import { PartitionMaintenanceJob } from "./jobs/partition-maintenance.job.ts";

await ensureDatabase();
await permissionMatrix.load();
permissionMatrix.startPolling();

app.listen(config.port.cms);

console.log(`[cms-service] running at http://${app.server?.hostname}:${app.server?.port}`);

const partitionJob = new PartitionMaintenanceJob(config.bullmq.redisUrl);
partitionJob.start();

export type App = typeof app;
