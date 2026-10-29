import type { GiftFulfillmentStatus } from "@materialhub/database";
import type { GiftFulfillmentService } from "./gift-fulfillment.service.ts";

export class GiftFulfillmentController {
  constructor(private service: GiftFulfillmentService) {}

  list(status?: GiftFulfillmentStatus, page?: number, perPage?: number) {
    return this.service.listForHub(status, page ?? 1, perPage ?? 24);
  }

  get(id: string) {
    return this.service.getForHub(id);
  }

  markReceived(id: string, vendorOrderId: string, userId: string | null) {
    return this.service.markVendorOrderReceived(id, vendorOrderId, userId);
  }

  assemble(id: string, userId: string | null, notes?: string) {
    return this.service.markAssembled(id, userId, notes);
  }

  dispatch(
    id: string,
    userId: string | null,
    data: { carrier: string; trackingNumber: string; trackingUrl?: string | null },
  ) {
    return this.service.dispatch(id, userId, data);
  }

  deliver(id: string, userId: string | null) {
    return this.service.markDelivered(id, userId);
  }

  cancel(id: string, userId: string | null, reason: string) {
    return this.service.cancel(id, userId, reason);
  }

  async packingSlip(id: string) {
    const { giftOrder, vendorOrders } = await this.service.getForHub(id);
    const items = vendorOrders.flatMap((vo: any) =>
      (vo.items ?? []).map((it: any) => ({
        product_name: it.product_name ?? "Unknown",
        variant_name: it.variant_name ?? null,
        quantity: it.quantity,
        vendor_name: vo.vendor?.name ?? null,
      })),
    );
    return {
      gift_order_id: giftOrder.id,
      box_name: (giftOrder as any).box_name_snapshot,
      recipient_name: (giftOrder as any).recipient_name,
      gift_message: (giftOrder as any).gift_message,
      fulfillment_status: giftOrder.fulfillment_status,
      items,
    };
  }
}
