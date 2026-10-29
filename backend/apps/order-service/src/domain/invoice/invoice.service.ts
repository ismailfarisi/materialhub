import type { Order } from "@materialhub/database";
import type { MediaService } from "@materialhub/utils";
import type { Repository } from "typeorm";
import { renderReceiptPdf } from "./receipt-pdf.ts";
import { buildReceiptViewModel } from "./receipt-view-model.ts";

export function receiptKey(orderId: string): string {
  return `private/receipts/${orderId}.pdf`;
}

const RECEIPT_RELATIONS = ["vendorOrders", "vendorOrders.vendor", "vendorOrders.items"];

export class InvoiceService {
  constructor(
    private orderRepo: Repository<Order>,
    private mediaService: Pick<MediaService, "uploadBuffer" | "getReceiptSignedUrl">,
  ) {}

  private async loadOrder(orderId: string): Promise<Order | null> {
    return this.orderRepo.findOne({
      where: { id: orderId } as any,
      relations: RECEIPT_RELATIONS,
    });
  }

  /**
   * Render + upload + persist the receipt for an order. Idempotent: no-ops when
   * a key already exists and the order has not changed since it was generated.
   * Never throws — failures are recorded to `invoice_last_error`, and the lazy
   * download path can retry later.
   */
  async generateForOrder(
    orderId: string,
  ): Promise<{ key: string } | { skipped: true } | { failed: true }> {
    const order = await this.loadOrder(orderId);
    if (!order) return { failed: true };
    return this.generateFor(order);
  }

  private async generateFor(
    order: Order,
  ): Promise<{ key: string } | { skipped: true } | { failed: true }> {
    const o = order as any;
    if (
      o.invoice_s3_key &&
      o.invoice_generated_at &&
      new Date(o.invoice_generated_at).getTime() >= new Date(o.updated_at).getTime()
    ) {
      return { skipped: true };
    }

    const key = receiptKey(o.id);
    try {
      const vm = buildReceiptViewModel(order as any);
      const pdf = await renderReceiptPdf(vm);
      await this.mediaService.uploadBuffer(key, pdf, "application/pdf");
      o.invoice_s3_key = key;
      o.invoice_generated_at = new Date();
      o.invoice_last_error = null;
      await this.orderRepo.save(order);
      return { key };
    } catch (err) {
      o.invoice_last_error = err instanceof Error ? err.message : String(err);
      await this.orderRepo.save(order).catch(() => {});
      console.error("[invoice] generation failed", { orderId: o.id, error: String(err) });
      return { failed: true };
    }
  }

  /**
   * Ownership-checked download resolver. Lazily generates the PDF if the order
   * has no stored key yet (covers historical orders and prior failures).
   */
  async resolveDownload(
    orderId: string,
    userId: string,
    role?: string,
  ): Promise<{ url: string } | { notFound: true } | { forbidden: true }> {
    const order = await this.loadOrder(orderId);
    if (!order) return { notFound: true };
    const isAdmin = role === "admin" || role === "super_admin";
    // Return notFound (not forbidden) for a non-owner so the endpoint is not an order-existence oracle (matches GET /buyer/orders/:id).
    if (!isAdmin && (order as any).user_id !== userId) return { notFound: true };

    let key = (order as any).invoice_s3_key as string | null;
    if (!key) {
      const gen = await this.generateFor(order);
      if ("key" in gen) key = gen.key;
      else return { notFound: true };
    }

    const { url } = await this.mediaService.getReceiptSignedUrl(key);
    return { url };
  }
}
