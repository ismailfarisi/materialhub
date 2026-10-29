import { AppDataSource, OrderItem, Reel, ReelStatus, SiteSetting } from "@materialhub/database";

export interface NudgeInput {
  orderId: string;
  userId: string;
}

export interface NudgeProduct {
  id: string;
  name: string;
  imageUrl: string;
}

export interface NotifierClient {
  send(payload: {
    userId: string;
    type: string;
    data: Record<string, unknown>;
  }): Promise<void>;
}

/**
 * Single-touch post-delivery reels nudge. Fired once per order.delivered
 * transition by Task 6's BullMQ job. Eligibility filters:
 *
 *   1. User has NOT already posted a reel tagging any product in this order
 *   2. Nudges are enabled globally (site_settings.reels_nudge_enabled)
 *   3. The order has at least one resolvable product
 *
 * This is intentionally single-touch — no follow-up reminders, no wallet
 * credit, no social-proof badge. One email/push when the order delivers.
 * Product decision from the M1 brainstorm.
 */
export class PostDeliveryNudgeService {
  protected notifier: NotifierClient = {
    async send() {
      // The default notifier is intentionally non-functional. Task 6 wires the
      // BullMQ worker that consumes `sendPostDeliveryReelNudge`; at that point
      // either:
      //   (a) notification-service gains a new /notifications/send-internal
      //       route gated by x-internal-secret (preferred — matches the existing
      //       notification-preference.routes.ts `/seed-internal` pattern), OR
      //   (b) reels-service mints a service JWT for /notifications/send.
      // Until then, no caller should be able to silently 401 — throw loudly.
      throw new Error("post_delivery_nudge_notifier_not_wired");
    },
  };

  /**
   * Inject the real HTTP notifier. Called from container.ts at service
   * bootstrap. The throwing default remains in place so any accidental
   * un-wired call still fails loudly.
   */
  setNotifier(notifier: NotifierClient): void {
    this.notifier = notifier;
  }

  async sendIfEligible(input: NudgeInput): Promise<void> {
    if (await this.hasExistingReelForOrder(input.orderId, input.userId)) return;
    if (!(await this.isNudgeEnabled())) return;
    const products = await this.resolveProducts(input.orderId);
    if (products.length === 0) return;

    await this.notifier.send({
      userId: input.userId,
      type: "reels_post_delivery_nudge",
      data: { orderId: input.orderId, products },
    });
  }

  protected async hasExistingReelForOrder(orderId: string, userId: string): Promise<boolean> {
    // Collect product ids in the order
    const productRows = await AppDataSource.getRepository(OrderItem)
      .createQueryBuilder("oi")
      .select("oi.product_id", "product_id")
      .where("oi.order_id = :oid", { oid: orderId })
      .andWhere("oi.deleted_at IS NULL")
      .getRawMany();
    const productIds = productRows
      .map((r: any) => r.product_id)
      .filter((id: string | null) => !!id);
    if (productIds.length === 0) return false;

    // Check if any of the user's approved or pending-review reels tag any of those products
    const count = await AppDataSource.getRepository(Reel)
      .createQueryBuilder("r")
      .innerJoin("reel_product_tags", "t", "t.reel_id = r.id")
      .where("r.user_id = :uid", { uid: userId })
      .andWhere("r.deleted_at IS NULL")
      .andWhere("r.status IN (:...statuses)", {
        statuses: [ReelStatus.approved, ReelStatus.pending_review],
      })
      .andWhere("t.product_id IN (:...ids)", { ids: productIds })
      .getCount();
    return count > 0;
  }

  protected async isNudgeEnabled(): Promise<boolean> {
    const row = await AppDataSource.getRepository(SiteSetting).findOne({
      where: { key: "reels_nudge_enabled" },
    });
    return row?.value === "true";
  }

  protected async resolveProducts(orderId: string): Promise<NudgeProduct[]> {
    // Use OrderItem snapshot columns instead of joining products/product_images.
    // Rationale:
    //  - `order_items` already snapshots `product_name` and `product_image_url`
    //    at purchase time, which is exactly what the customer saw when they
    //    bought. The nudge is about the delivered order, so snapshot is right.
    //  - Survives soft-deleted products (discontinued SKUs).
    //  - Fewer joins means fewer soft-delete traps.
    // Dedupe by product_id in application code — multi-vendor splitting or
    // repeat line items can produce multiple rows for the same product_id.
    const rows = await AppDataSource.getRepository(OrderItem)
      .createQueryBuilder("oi")
      .select("oi.product_id", "id")
      .addSelect("oi.product_name", "name")
      .addSelect("oi.product_image_url", "image_url")
      .where("oi.order_id = :oid", { oid: orderId })
      .andWhere("oi.deleted_at IS NULL")
      .getRawMany();
    const byId = new Map<string, NudgeProduct>();
    for (const r of rows as any[]) {
      if (!r.id) continue;
      if (!byId.has(r.id)) {
        byId.set(r.id, {
          id: r.id,
          name: r.name ?? "",
          // imageUrl may be "" if the snapshot was missing — Task 7's
          // notification template must handle the empty-string fallback.
          imageUrl: r.image_url ?? "",
        });
      }
    }
    return [...byId.values()];
  }
}
