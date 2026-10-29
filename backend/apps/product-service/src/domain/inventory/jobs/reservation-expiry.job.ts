import { Queue, Worker } from "bullmq";
import type { InventoryReservationService } from "../inventory-reservation.service.ts";

const QUEUE_NAME = "reservation-expiry";

export class ReservationExpiryJob {
  private worker: Worker | null = null;
  private queue: Queue;

  constructor(
    private readonly redisUrl: string,
    private readonly reservationService: InventoryReservationService,
  ) {
    const connection = { url: this.redisUrl };
    this.queue = new Queue(QUEUE_NAME, { connection });
  }

  async start() {
    const connection = { url: this.redisUrl };

    this.worker = new Worker(
      QUEUE_NAME,
      async () => {
        const released = await this.reservationService.releaseExpired();
        if (released > 0) {
          console.log(`[reservation-expiry] Released ${released} expired reservations`);
        }
      },
      { connection },
    );

    // Schedule repeating job every minute
    await this.queue.upsertJobScheduler(
      "expiry-check",
      { every: 60_000 },
      { name: "check-expired-reservations" },
    );

    console.log("[reservation-expiry] Worker started");
  }

  async stop() {
    await this.worker?.close();
    await this.queue.close();
  }
}
