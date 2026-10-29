import { describe, expect, it, mock } from "bun:test";
import { PostDeliveryNudgeService } from "./post-delivery-nudge.service.ts";

describe("PostDeliveryNudgeService.sendIfEligible", () => {
  it("skips when user already has a reel tagging any product in the order", async () => {
    const svc = new PostDeliveryNudgeService();
    const notifierSend = mock(async () => undefined);
    (svc as any).notifier = { send: notifierSend };
    (svc as any).hasExistingReelForOrder = async () => true;
    (svc as any).isNudgeEnabled = async () => true;
    (svc as any).resolveProducts = async () => [
      { id: "p1", name: "Product", imageUrl: "http://img/x" },
    ];

    await svc.sendIfEligible({ orderId: "o1", userId: "u1" });
    expect(notifierSend).not.toHaveBeenCalled();
  });

  it("skips when nudges are disabled in site_settings", async () => {
    const svc = new PostDeliveryNudgeService();
    const notifierSend = mock(async () => undefined);
    (svc as any).notifier = { send: notifierSend };
    (svc as any).hasExistingReelForOrder = async () => false;
    (svc as any).isNudgeEnabled = async () => false;
    (svc as any).resolveProducts = async () => [
      { id: "p1", name: "Product", imageUrl: "http://img/x" },
    ];

    await svc.sendIfEligible({ orderId: "o1", userId: "u1" });
    expect(notifierSend).not.toHaveBeenCalled();
  });

  it("skips when the order has no resolvable products", async () => {
    const svc = new PostDeliveryNudgeService();
    const notifierSend = mock(async () => undefined);
    (svc as any).notifier = { send: notifierSend };
    (svc as any).hasExistingReelForOrder = async () => false;
    (svc as any).isNudgeEnabled = async () => true;
    (svc as any).resolveProducts = async () => [];

    await svc.sendIfEligible({ orderId: "o1", userId: "u1" });
    expect(notifierSend).not.toHaveBeenCalled();
  });

  it("sends notification with delivered products payload when eligible", async () => {
    const svc = new PostDeliveryNudgeService();
    const sent: any[] = [];
    (svc as any).notifier = {
      send: async (payload: any) => {
        sent.push(payload);
      },
    };
    (svc as any).hasExistingReelForOrder = async () => false;
    (svc as any).isNudgeEnabled = async () => true;
    (svc as any).resolveProducts = async () => [
      { id: "p1", name: "Serum", imageUrl: "http://img/p1" },
      { id: "p2", name: "Lipstick", imageUrl: "http://img/p2" },
    ];

    await svc.sendIfEligible({ orderId: "o1", userId: "u1" });
    expect(sent.length).toBe(1);
    expect(sent[0].userId).toBe("u1");
    expect(sent[0].type).toBe("reels_post_delivery_nudge");
    expect(sent[0].data.orderId).toBe("o1");
    expect(sent[0].data.products).toHaveLength(2);
    expect(sent[0].data.products[0].id).toBe("p1");
  });
});
