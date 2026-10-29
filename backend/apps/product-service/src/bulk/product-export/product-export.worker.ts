import { config } from "@materialhub/config";
import { Worker } from "bullmq";
import type { ProductExportService } from "./product-export.service.ts";

export async function startProductExportWorker(service: ProductExportService): Promise<Worker> {
  const worker = new Worker(
    "product-export",
    async (job) => {
      await service.runExport(job.data.jobId);
      return { ok: true };
    },
    {
      connection: { url: config.bullmq.redisUrl },
      concurrency: 2,
      lockDuration: 30 * 60 * 1000,
    },
  );

  worker.on("error", (error) => console.error("[product-export-worker] error", error));
  return worker;
}
