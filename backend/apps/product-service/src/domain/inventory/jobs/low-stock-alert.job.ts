import { config } from "@materialhub/config";
import { Queue, Worker } from "bullmq";

const QUEUE_NAME = "low-stock-alerts";

export class LowStockAlertJob {
  private worker: Worker | null = null;
  public queue: Queue;

  constructor(private readonly redisUrl: string) {
    const connection = { url: this.redisUrl };
    this.queue = new Queue(QUEUE_NAME, { connection });
  }

  async start() {
    const connection = { url: this.redisUrl };

    this.worker = new Worker(
      QUEUE_NAME,
      async (job) => {
        const { vendorUserId, productName, currentStock } = job.data;
        // Fire notification to vendor
        await fetch(`${config.internal.notificationServiceUrl}/notifications/send`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Internal-Secret": config.internal.serviceSecret,
          },
          body: JSON.stringify({
            user_id: vendorUserId,
            type: "low_stock_alert",
            channel: "email",
            data: { productName, currentStock },
          }),
        }).catch(() => {});
      },
      { connection },
    );

    console.log("[low-stock-alert] Worker started");
  }

  async stop() {
    await this.worker?.close();
    await this.queue.close();
  }
}
