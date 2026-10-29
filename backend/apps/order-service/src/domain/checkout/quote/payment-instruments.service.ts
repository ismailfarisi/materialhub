import type { Payment } from "@materialhub/database";
import type { PaymentInstrumentsResponse } from "@materialhub/dto";
import type { Repository } from "typeorm";
import { CARD_BRAND_FUNDING } from "./defaults.ts";

// NOTE: MaterialHub does not yet have a saved-payment-methods / payment_tokens table.
// This service derives instruments from past successful `payments` rows.
// TODO: replace with a first-class saved-instruments store when available.

export class PaymentInstrumentsService {
  constructor(private paymentRepo: Repository<Payment>) {}

  async listForUser(
    userId: string,
    now = new Date(),
  ): Promise<PaymentInstrumentsResponse["instruments"]> {
    const rows = (await this.paymentRepo.find({
      where: { user_id: userId },
      order: { created_at: "DESC" },
    } as any)) as Payment[];

    const seen = new Map<string, Payment>();
    for (const r of rows) {
      if (!r.card_brand || !r.card_last4 || !r.card_expiry) continue;
      if (!["captured", "authorized"].includes(String(r.status))) continue;
      const key = `${r.card_brand}|${r.card_last4}|${r.card_expiry}`;
      if (!seen.has(key)) seen.set(key, r);
    }

    const out: PaymentInstrumentsResponse["instruments"] = [];
    let first = true;
    for (const row of seen.values()) {
      const [mmStr, yyyyStr] = (row.card_expiry ?? "").split("/");
      const exp_month = Number(mmStr);
      const exp_year = Number(yyyyStr);
      const expiryEnd = new Date(exp_year, exp_month, 0, 23, 59, 59);
      const brand = String(row.card_brand).toLowerCase();
      out.push({
        id: row.id,
        type: "card",
        brand,
        last4: String(row.card_last4),
        exp_month,
        exp_year,
        is_expired: expiryEnd < now,
        is_default: first,
        requires_3ds: false,
        network_token_available: false,
        funding: CARD_BRAND_FUNDING[brand] ?? "unknown",
      });
      first = false;
    }
    return out;
  }
}
