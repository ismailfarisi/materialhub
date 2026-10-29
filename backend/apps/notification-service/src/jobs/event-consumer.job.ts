import { config } from "@materialhub/config";
import { Queue, Worker } from "bullmq";
import type { OrderEmailService } from "../services/order-email.service.ts";

export const NOTIFICATION_EVENTS_QUEUE = "notification-events";

let notificationEventsQueue: Queue | null = null;

export function getNotificationEventsQueue(): Queue {
  if (!notificationEventsQueue) {
    notificationEventsQueue = new Queue(NOTIFICATION_EVENTS_QUEUE, {
      connection: { url: config.bullmq.redisUrl },
    });
  }
  return notificationEventsQueue;
}

const STATUS_TO_NOTIFICATION: Record<string, string> = {
  confirmed: "order_confirmed",
  shipped: "order_shipped",
  delivered: "order_delivered",
  refund_requested: "return_requested",
  disputed: "dispute_opened",
};

// Vendor-side fulfilment roles that get the new-order alert — same set
// OrderEmailService.resolveVendorRecipients uses for the rich email.
const VENDOR_NOTIFY_ROLES = new Set(["owner", "manager", "staff"]);

interface VendorAlertRepos {
  vendorOrderRepo: { find(opts: any): Promise<any[]> };
  vendorMemberRepo: { find(opts: any): Promise<any[]> };
}

export function createEventConsumerWorker(
  dispatchQueue: Queue,
  orderRepo: any,
  orderEmailService?: OrderEmailService,
  vendorAlertRepos?: VendorAlertRepos,
): Worker {
  return new Worker(
    NOTIFICATION_EVENTS_QUEUE,
    async (job) => {
      const event = job.data;

      // Best-effort customer email when an admin cancels item(s) from an
      // order. Never throws — a failed send here must not retry the job or
      // block any other notification.
      if (event.type === "order.items_cancelled" && orderEmailService) {
        await orderEmailService.sendForItemsCancelled(event.cancellationId).catch((err) =>
          console.error("[notification] items-cancelled email failed", {
            cancellationId: event.cancellationId,
            error: String(err),
          }),
        );
        return;
      }

      if (event.type === "order.status.changed") {
        const notificationType = STATUS_TO_NOTIFICATION[event.toStatus];
        if (!notificationType) return;

        // Rich transactional order-placed emails (customer confirmation +
        // per-vendor new-order alert) fire once, on the confirmed transition.
        // Sent directly via SES, independent of the per-user in-app dispatch
        // and its notification preferences. Best-effort — never throw here or
        // the whole notification job retries and re-sends the in-app copy.
        if (event.toStatus === "confirmed" && orderEmailService) {
          await orderEmailService.sendForConfirmedOrder(event.orderId).catch((err) =>
            console.error("[notification] order-placed email failed", {
              orderId: event.orderId,
              error: String(err),
            }),
          );
        }

        const order = await orderRepo.findOne({ where: { id: event.orderId } });
        if (!order) return;

        await dispatchQueue.add("dispatch", {
          type: notificationType,
          userId: order.user_id,
          variables: {
            order_number: order.order_number || "",
            orderId: event.orderId,
            tracking_url: event.metadata?.tracking_url || "",
          },
          data: { orderId: event.orderId, vendorOrderId: event.vendorOrderId },
        });

        // Preference-aware vendor_new_order dispatch to each vendor team
        // member with a linked user account (in-app / email / push /
        // whatsapp per their own preferences). The rich SES email above is
        // unconditional and address-based (members without accounts still
        // get it) — this complements it, not replaces it. Deterministic
        // jobIds make a retried source job a no-op instead of a duplicate.
        if (event.toStatus === "confirmed" && vendorAlertRepos) {
          const { vendorOrderRepo, vendorMemberRepo } = vendorAlertRepos;
          const vendorOrders = await vendorOrderRepo.find({
            where: { order_id: event.orderId },
          });
          for (const vo of vendorOrders) {
            const members = await vendorMemberRepo.find({
              where: { vendor_id: vo.vendor_id, status: "active" },
            });
            const amountFils = Number(vo.vendor_total ?? vo.subtotal ?? 0) || 0;
            const amount = `AED ${(amountFils / 100).toFixed(2)}`;
            for (const member of members) {
              if (!member.user_id || !VENDOR_NOTIFY_ROLES.has(String(member.role))) continue;
              await dispatchQueue.add(
                "dispatch",
                {
                  type: "vendor_new_order",
                  userId: member.user_id,
                  variables: {
                    order_number: vo.vendor_order_number || order.order_number || "",
                    amount,
                    vendorOrderId: vo.id,
                  },
                  data: { orderId: event.orderId, vendorOrderId: vo.id },
                },
                { jobId: `dispatch_vendor_new_order_${vo.id}_${member.user_id}` },
              );
            }
          }
        }
      }

      if (event.userId && event.notificationType) {
        // `eventId` (optional) is the producer's stable dedupe key for an
        // at-least-once event — the same event_id contract the Slack support
        // relay uses. Passing it as the dispatch job's jobId makes a
        // replayed/retried source job a no-op here (BullMQ ignores an `add`
        // for an id it already holds) instead of a duplicate email/push.
        // Absent eventId keeps the previous auto-id behaviour.
        await dispatchQueue.add(
          "dispatch",
          {
            type: event.notificationType,
            userId: event.userId,
            variables: event.variables || {},
            data: event.data || {},
          },
          event.eventId ? { jobId: `dispatch_${event.eventId}` } : undefined,
        );
      }
    },
    {
      connection: { url: config.bullmq.redisUrl },
      concurrency: 3,
    },
  );
}
