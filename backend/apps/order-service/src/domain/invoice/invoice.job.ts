import { config } from "@materialhub/config";
import { Queue, Worker } from "bullmq";
import type { InvoiceService } from "./invoice.service.ts";

export const ORDER_INVOICES_QUEUE = "order-invoices";

let queue: Queue | null = null;

export function getOrderInvoicesQueue(): Queue {
  if (!queue) {
    queue = new Queue(ORDER_INVOICES_QUEUE, {
      connection: { url: config.bullmq.redisUrl },
    });
  }
  return queue;
}

export function createInvoiceWorker(invoiceService: InvoiceService): Worker {
  return new Worker(
    ORDER_INVOICES_QUEUE,
    async (job) => {
      const orderId = job.data?.orderId as string | undefined;
      if (!orderId) return;
      await invoiceService.generateForOrder(orderId);
    },
    { connection: { url: config.bullmq.redisUrl }, concurrency: 2 },
  );
}
