import { config } from "@materialhub/config";
import { Queue, Worker } from "bullmq";
import type { CartAbandonmentService } from "./cart-abandonment.service.ts";

const QUEUE_NAME = "cart-abandonment-reminder";

let reminderQueue: Queue | null = null;

export function getCartAbandonmentReminderQueue(): Queue {
  if (!reminderQueue) {
    reminderQueue = new Queue(QUEUE_NAME, { connection: { url: config.bullmq.redisUrl } });
  }
  return reminderQueue;
}

export function createCartAbandonmentReminderWorker(
  service: CartAbandonmentService,
  notificationQueue: Queue,
) {
  return new Worker(
    QUEUE_NAME,
    async () => {
      for (const reminderNum of [1, 2, 3] as const) {
        const carts = await service.getCartsForReminder(reminderNum);
        for (const cart of carts) {
          const email = cart.email ?? (cart.user as any)?.email;
          if (!email) continue;

          await notificationQueue.add("notification-event", {
            type: "cart_abandonment_reminder",
            email,
            userId: cart.user_id,
            reminderNumber: reminderNum,
            cartSnapshot: cart.cart_snapshot,
            cartTotal: cart.cart_total,
            currency: cart.currency,
          });

          await service.markReminderSent(cart.id);
        }
      }
    },
    { connection: { url: config.bullmq.redisUrl } },
  );
}

export async function scheduleCartAbandonmentReminder(queue: Queue) {
  await queue.upsertJobScheduler(
    "send-abandonment-reminders",
    { pattern: "*/30 * * * *" },
    { name: "send-reminders" },
  );
}
