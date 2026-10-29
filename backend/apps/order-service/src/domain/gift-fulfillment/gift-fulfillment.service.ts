import {
  AppDataSource,
  Commission,
  CommissionStatus,
  GiftOrder,
  GiftOrderStatusHistory,
  OrderStatus,
  GiftFulfillmentStatus as S,
  VendorOrder,
} from "@materialhub/database";
import { HttpError } from "@materialhub/plugins";
import type { EntityManager } from "typeorm";
import type { CommissionService } from "../commission/commission.service.ts";
import { assertGiftTransition } from "./gift-order-state-machine.ts";

/**
 * Pure helper: given the total number of gift vendor_orders and how many have
 * been received at the hub, decide the next fulfillment status.
 */
export function recomputeAfterReceipt(totalGiftVendorOrders: number, receivedCount: number): S {
  if (totalGiftVendorOrders > 0 && receivedCount >= totalGiftVendorOrders) {
    return S.ready_to_assemble;
  }
  return S.partially_received;
}

type HistoryWriter = Pick<EntityManager, "getRepository"> | typeof AppDataSource;

export class GiftFulfillmentService {
  constructor(private commissionService: CommissionService) {}

  private get giftOrderRepo() {
    return AppDataSource.getRepository(GiftOrder);
  }
  private get vendorOrderRepo() {
    return AppDataSource.getRepository(VendorOrder);
  }

  private async writeHistory(
    repoOrManager: HistoryWriter,
    giftOrderId: string,
    from: string,
    to: string,
    userId: string | null,
    note?: string,
  ) {
    await repoOrManager.getRepository(GiftOrderStatusHistory).save({
      gift_order_id: giftOrderId,
      from_status: from,
      to_status: to,
      changed_by: userId,
      note: note ?? null,
    });
  }

  async listForHub(status?: S, page = 1, perPage = 24) {
    const where = status ? { fulfillment_status: status } : {};
    const [items, total] = await this.giftOrderRepo.findAndCount({
      where,
      order: { created_at: "DESC" },
      skip: (page - 1) * perPage,
      take: perPage,
    });
    return { items, total, page, perPage };
  }

  async getForHub(giftOrderId: string) {
    const giftOrder = await this.giftOrderRepo.findOne({ where: { id: giftOrderId } });
    if (!giftOrder) {
      throw new HttpError(404, "Gift order not found", "GIFT_ORDER_NOT_FOUND");
    }
    const vendorOrders = await this.vendorOrderRepo.find({
      where: { gift_order_id: giftOrderId },
      relations: { items: true, vendor: true },
    });
    return { giftOrder, vendorOrders };
  }

  /**
   * Mark a single gift vendor_order as received at the hub. Releases that leg's
   * held commissions to payout-eligible and recomputes the parent fulfillment
   * status (partially_received → ready_to_assemble when all legs are in).
   */
  async markVendorOrderReceived(giftOrderId: string, vendorOrderId: string, userId: string | null) {
    return AppDataSource.manager.transaction(async (m) => {
      const giftOrder = await m.getRepository(GiftOrder).findOne({ where: { id: giftOrderId } });
      if (!giftOrder) {
        throw new HttpError(404, "Gift order not found", "GIFT_ORDER_NOT_FOUND");
      }
      const vo = await m
        .getRepository(VendorOrder)
        .findOne({ where: { id: vendorOrderId, gift_order_id: giftOrderId } });
      if (!vo) {
        throw new HttpError(404, "Gift vendor order not found", "GIFT_VENDOR_ORDER_NOT_FOUND");
      }
      if (!vo.received_at_hub_at) {
        const receivedAt = new Date();
        vo.received_at_hub_at = receivedAt;
        // Hub receipt completes the vendor leg of the journey.
        vo.status = OrderStatus.delivered;
        // R4-C4: stamp `delivered_at` too. Everything downstream of delivery
        // keys off that column, not off `received_at_hub_at`: the migration
        // that backfills settlement clocks, and
        // `CommissionService.backfillCommissionsForOrder`'s re-stamp (which
        // only restores a clock when `delivered_at && status === delivered`).
        // Setting the status without the timestamp left a gift leg looking
        // delivered to the state machine while being invisible to every
        // settlement-clock writer — so a recalculated gift commission was
        // stranded `held` with `settle_after IS NULL`, which nothing can
        // promote and no admin action can repair.
        vo.delivered_at = receivedAt;
        await m.getRepository(VendorOrder).save(vo);
        // Start this leg's settlement clock — same convention as the direct
        // delivery path in OrderStatusService: stamp `settle_after` and let
        // the settlement job promote held -> pending once it matures, rather
        // than flipping the status directly here.
        const days = await this.commissionService.getSettlementWindowDays(vo.vendor_id);
        await m
          .getRepository(Commission)
          .update(
            { vendor_order_id: vendorOrderId, status: CommissionStatus.held },
            { settle_after: new Date(Date.now() + days * 86_400_000) },
          );
      }
      const all = await m
        .getRepository(VendorOrder)
        .find({ where: { gift_order_id: giftOrderId } });
      const received = all.filter((v) => v.received_at_hub_at).length;
      const to = recomputeAfterReceipt(all.length, received);
      // Only transition + record history if the status actually changes, to
      // avoid a no-op self-transition error from the state machine.
      if (giftOrder.fulfillment_status !== to) {
        assertGiftTransition(giftOrder.fulfillment_status, to);
        const from = giftOrder.fulfillment_status;
        giftOrder.fulfillment_status = to;
        await m.getRepository(GiftOrder).save(giftOrder);
        await this.writeHistory(
          m,
          giftOrderId,
          from,
          to,
          userId,
          `received vendor_order ${vendorOrderId}`,
        );
      }
      return { giftOrder, received, total: all.length };
    });
  }

  private async transitionSimple(
    giftOrderId: string,
    to: S,
    userId: string | null,
    mutate: (g: GiftOrder) => void,
    note?: string,
  ) {
    return AppDataSource.manager.transaction(async (m) => {
      const g = await m.getRepository(GiftOrder).findOne({ where: { id: giftOrderId } });
      if (!g) throw new HttpError(404, "Gift order not found", "GIFT_ORDER_NOT_FOUND");
      assertGiftTransition(g.fulfillment_status, to);
      const from = g.fulfillment_status;
      mutate(g);
      g.fulfillment_status = to;
      await m.getRepository(GiftOrder).save(g);
      await this.writeHistory(m, giftOrderId, from, to, userId, note);
      return g;
    });
  }

  async markAssembled(giftOrderId: string, userId: string | null, notes?: string) {
    return this.transitionSimple(
      giftOrderId,
      S.packed,
      userId,
      (g) => {
        if (notes) g.assembly_notes = notes;
        g.assembled_at = new Date();
      },
      "assembled",
    );
  }

  async dispatch(
    giftOrderId: string,
    userId: string | null,
    data: { carrier: string; trackingNumber: string; trackingUrl?: string | null },
  ) {
    return this.transitionSimple(
      giftOrderId,
      S.shipped,
      userId,
      (g) => {
        g.outbound_carrier = data.carrier;
        g.outbound_tracking_number = data.trackingNumber;
        g.outbound_tracking_url = data.trackingUrl ?? null;
        g.dispatched_at = new Date();
      },
      "dispatched",
    );
  }

  async markDelivered(giftOrderId: string, userId: string | null) {
    return this.transitionSimple(giftOrderId, S.delivered, userId, (g) => {
      g.delivered_at = new Date();
    });
  }

  async cancel(giftOrderId: string, userId: string | null, reason: string) {
    return this.transitionSimple(giftOrderId, S.cancelled, userId, () => {}, reason);
  }
}
