// End-to-end ledger test for net terms against a real Postgres (skips when
// none is reachable): confirm on terms → tax invoices → payout hold →
// mark paid → payout release; plus the credit limit, idempotency and
// cancellation release.
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
  AppDataSource,
  Commission,
  Order,
  TaxInvoice,
  ensureDatabase,
} from "@materialhub/database";
import { runCommissionSettlement } from "../commission/commission-settlement.job.ts";
import { TaxInvoiceService } from "../invoice/tax-invoice/tax-invoice.service.ts";
import { NetTermsService } from "./net-terms.service.ts";

let available = false;
const ids: Record<string, string> = {};
const tag = `nt${Date.now().toString(36)}`;
const sideEffects = {
  calls: [] as string[],
  async recordCouponUsage(id: string) {
    this.calls.push(`coupon:${id}`);
  },
  async clearCustomerCart(id: string | null | undefined) {
    this.calls.push(`cart:${id}`);
  },
  async triggerAutoShipments(id: string) {
    this.calls.push(`ship:${id}`);
  },
  async emitOrderPlaced(id: string) {
    this.calls.push(`placed:${id}`);
  },
};

async function q(sql: string, params: unknown[] = []) {
  return AppDataSource.query(sql, params);
}

async function one(sql: string, params: unknown[] = []) {
  const rows = await q(sql, params);
  return rows[0];
}

/** A pending order of `amount` fils from the buyer, with one item and a held commission. */
async function makeOrder(n: number, amount: number, delivered = true): Promise<string> {
  const o = await one(
    `INSERT INTO orders (order_number, user_id, subtotal, grand_total, shipping_address, billing_address)
     VALUES ($1, $2, $3, $3, '{"city":"Sharjah"}', $4) RETURNING id`,
    [
      `${tag}-${n}`,
      ids.buyer,
      amount,
      JSON.stringify({
        type: "business",
        legal_name: "Gulf Rigid Box Workshop LLC",
        trn: "100234567800003",
      }),
    ],
  );
  const vo = await one(
    `INSERT INTO vendor_orders (order_id, vendor_id, vendor_order_number, subtotal, vendor_total, status, delivered_at)
     VALUES ($1, $2, $3, $4, $4, $5, $6) RETURNING id`,
    [
      o.id,
      ids.vendor,
      `${tag}-${n}-V1`,
      amount,
      delivered ? "delivered" : "confirmed",
      delivered ? new Date(Date.now() - 30 * 864e5) : null,
    ],
  );
  const item = await one(
    `INSERT INTO order_items (order_id, vendor_order_id, vendor_id, product_id, product_name, variant_name, quantity, unit_price, line_total)
     VALUES ($1, $2, $3, $4, 'Greyboard 2.0 mm', '70×100 cm', 100, $5, $6) RETURNING id`,
    [o.id, vo.id, ids.vendor, ids.product, Math.round(amount / 100), amount],
  );
  // Commission already past its settlement window: only the net-terms
  // guard can keep it held.
  await q(
    `INSERT INTO commissions (vendor_id, order_id, vendor_order_id, order_item_id, commission_type, commission_rate,
                              item_total, commission_amount, vendor_earning, status, settle_after)
     VALUES ($1, $2, $3, $4, 'percentage', 10, $5, $6, $7, 'held', now() - interval '1 day')`,
    [
      ids.vendor,
      o.id,
      vo.id,
      item.id,
      amount,
      Math.round(amount / 10),
      amount - Math.round(amount / 10),
    ],
  );
  return o.id;
}

beforeAll(async () => {
  try {
    await ensureDatabase();
    available = AppDataSource.isInitialized;
  } catch {
    available = false;
  }
  if (!available) return;
  ids.buyer = (
    await one(
      `INSERT INTO users (first_name, last_name, email, password_hash) VALUES ('Mariam', 'Haddad', $1, 'x') RETURNING id`,
      [`${tag}@gulfrigidbox.example`],
    )
  ).id;
  ids.vendor = (
    await one(
      `INSERT INTO vendors (name, slug, business_name, business_type, contact_email, contact_phone, trn)
       VALUES ('Emirates Board & Paper', $1, 'Emirates Board & Paper Trading LLC', 'trading', 'sales@ebp.example', '+97140000000', '100987654300003')
       RETURNING id`,
      [`${tag}-ebp`],
    )
  ).id;
  const cat = await one(
    `INSERT INTO categories (name, slug) VALUES ('Papers & boards ${tag}', $1) RETURNING id`,
    [`${tag}-papers`],
  );
  ids.product = (
    await one(
      `INSERT INTO products (vendor_id, category_id, name, slug, price) VALUES ($1, $2, 'Greyboard 2.0 mm', $3, 480) RETURNING id`,
      [ids.vendor, cat.id, `${tag}-greyboard`],
    )
  ).id;
  ids.business = (
    await one(
      `INSERT INTO business_accounts (legal_name, trade_licence_number, trade_licence_expiry, vat_registered, trn,
                                      peppol_participant_id, billing_address, verification_status, created_by)
       VALUES ('Gulf Rigid Box Workshop LLC', 'SHJ-55120', '2027-08-31', true, '100234567800003', '0235:1002345678',
               '{"line1":"Industrial Area 13","city":"Sharjah","emirate":"Sharjah","country_code":"AE"}', 'verified', $1)
       RETURNING id`,
      [ids.buyer],
    )
  ).id;
  await q(
    `INSERT INTO business_members (business_account_id, user_id, email, role, status)
     VALUES ($1, $2, $3, 'admin', 'active')`,
    [ids.business, ids.buyer, `${tag}@gulfrigidbox.example`],
  );
  await q(
    `INSERT INTO business_credit_accounts (business_account_id, terms, status, credit_limit_fils)
     VALUES ($1, 'net_30', 'approved', 1000000)`,
    [ids.business],
  );
});

afterAll(async () => {
  if (!available) return;
  // Leave the shared dev database as we found it.
  await q(
    "DELETE FROM tax_invoices WHERE order_id IN (SELECT id FROM orders WHERE order_number LIKE $1)",
    [`${tag}-%`],
  );
  for (const t of ["commissions", "payments", "order_status_history", "order_items"]) {
    await q(
      `DELETE FROM ${t} WHERE order_id IN (SELECT id FROM orders WHERE order_number LIKE $1)`,
      [`${tag}-%`],
    );
  }
  await q("DELETE FROM vendor_orders WHERE vendor_order_number LIKE $1", [`${tag}-%`]);
  await q("DELETE FROM orders WHERE order_number LIKE $1", [`${tag}-%`]);
  await q("DELETE FROM business_credit_accounts WHERE business_account_id = $1", [ids.business]);
  await q("DELETE FROM business_members WHERE business_account_id = $1", [ids.business]);
  await q("DELETE FROM business_accounts WHERE id = $1", [ids.business]);
  await q("DELETE FROM invoice_number_sequences WHERE series LIKE $1", [`vendor:${ids.vendor}:%`]);
  await q("DELETE FROM products WHERE id = $1", [ids.product]);
  await q("DELETE FROM categories WHERE slug = $1", [`${tag}-papers`]);
  await q("DELETE FROM vendors WHERE id = $1", [ids.vendor]);
  await q("DELETE FROM users WHERE id = $1", [ids.buyer]);
});

const service = () => new NetTermsService(AppDataSource.getRepository(Order), sideEffects);
const credit = async () =>
  Number(
    (
      await one(
        "SELECT outstanding_fils FROM business_credit_accounts WHERE business_account_id = $1",
        [ids.business],
      )
    ).outstanding_fils,
  );

describe("net terms ledger (real Postgres; skips if unavailable)", () => {
  it("confirms on terms, holds the payout, releases it once paid", async () => {
    if (!available) return;
    const orderId = await makeOrder(1, 600000);
    const res = await service().confirmOrder(orderId, ids.buyer!);
    expect(res.status).toBe("confirmed");
    expect(res.terms).toBe("net_30");

    const o = await one(
      "SELECT status, payment_status, payment_terms, payment_due_at, business_account_id FROM orders WHERE id = $1",
      [orderId],
    );
    expect(o).toMatchObject({
      status: "confirmed",
      payment_status: "authorized",
      payment_terms: "net_30",
      business_account_id: ids.business,
    });
    const days = (new Date(o.payment_due_at).getTime() - Date.now()) / 864e5;
    expect(Math.round(days)).toBe(30);
    expect(await credit()).toBe(600000);
    const p = await one(
      "SELECT status, payment_method, gateway, amount FROM payments WHERE order_id = $1",
      [orderId],
    );
    expect(p).toMatchObject({
      status: "authorized",
      payment_method: "net_terms",
      gateway: "net_terms",
      amount: 600000,
    });
    expect(sideEffects.calls).toContain(`placed:${orderId}`);

    // Idempotent: a second confirm changes nothing.
    const again = await service().confirmOrder(orderId, ids.buyer!);
    expect(again.idempotent).toBe(true);
    expect(await credit()).toBe(600000);
    expect((await q("SELECT id FROM payments WHERE order_id = $1", [orderId])).length).toBe(1);

    // Tax invoices: one per vendor sub-order, both TRNs, due date, unpaid.
    const tis = new TaxInvoiceService(
      AppDataSource.getRepository(TaxInvoice),
      AppDataSource.getRepository(Order),
      {
        uploadBuffer: async () => {},
        getReceiptSignedUrl: async (k) => ({
          url: `https://example.invalid/${k}`,
          expiresAt: new Date(),
        }),
      },
    );
    const created = await tis.generateForOrder(orderId);
    expect(created.length).toBe(1);
    expect(created[0]!.invoice_number).toMatch(/^INV-[0-9A-F]{8}-\d{4}-000001$/);
    expect(created[0]!.seller.trn).toBe("100987654300003");
    expect(created[0]!.buyer.trn).toBe("100234567800003");
    expect(created[0]!.payable_fils).toBe(600000);
    expect(String(created[0]!.payment_status)).toBe("unpaid");
    expect(created[0]!.due_date).not.toBeNull();
    // Generation is idempotent too.
    expect((await tis.generateForOrder(orderId)).length).toBe(0);
    const xml = await tis.xmlFor(ids.buyer!, created[0]!.id);
    expect(xml.xml).toContain("<cbc:CompanyID>100234567800003</cbc:CompanyID>");
    const list = await tis.listForUser(ids.buyer!, {});
    expect(
      list.items.some((i) => i.id === created[0]!.id && i.buyer_trn === "100234567800003"),
    ).toBe(true);

    // Delivered and past the settlement window, but unpaid: stays held.
    await runCommissionSettlement({
      commissionRepo: AppDataSource.getRepository(Commission),
    });
    expect(
      (await one("SELECT status FROM commissions WHERE order_id = $1", [orderId])).status,
    ).toBe("held");

    // Receivables list shows it as due.
    const rec = await service().listReceivables({ q: `${tag}-1` });
    expect(rec.items[0]).toMatchObject({ order_id: orderId, status: "due", amount_fils: 600000 });
    expect(rec.items[0]!.invoices.length).toBe(1);

    // Admin marks paid → captured, credit freed, invoices paid, payout released.
    await service().markPaid(orderId, ids.buyer!, { reference: "FAB-TT-88213" });
    expect(
      (await one("SELECT payment_status FROM orders WHERE id = $1", [orderId])).payment_status,
    ).toBe("captured");
    expect(await credit()).toBe(0);
    expect(
      (await one("SELECT payment_status FROM tax_invoices WHERE order_id = $1", [orderId]))
        .payment_status,
    ).toBe("paid");
    const again2 = await service().markPaid(orderId, ids.buyer!, { reference: "FAB-TT-88213" });
    expect(again2.idempotent).toBe(true);
    expect(await credit()).toBe(0);
    await runCommissionSettlement({
      commissionRepo: AppDataSource.getRepository(Commission),
    });
    expect(
      (await one("SELECT status FROM commissions WHERE order_id = $1", [orderId])).status,
    ).toBe("pending");
  });

  it("refuses an order above the remaining credit", async () => {
    if (!available) return;
    const a = await makeOrder(2, 700000, false);
    await service().confirmOrder(a, ids.buyer!);
    const b = await makeOrder(3, 300001, false); // 1,000,000 − 700,000 = 300,000 left
    await expect(service().confirmOrder(b, ids.buyer!)).rejects.toMatchObject({
      code: "NET_TERMS_OVER_CREDIT",
    });
    expect(await credit()).toBe(700000);
    expect((await one("SELECT status FROM orders WHERE id = $1", [b])).status).toBe(
      "pending_payment",
    );
  });

  it("releases the credit when an unpaid order is cancelled", async () => {
    if (!available) return;
    const before = await credit();
    const id = await makeOrder(4, 100000, false);
    await service().confirmOrder(id, ids.buyer!);
    expect(await credit()).toBe(before + 100000);
    expect(await service().releaseForCancelledOrder(id)).toBe(true);
    expect(await service().releaseForCancelledOrder(id)).toBe(false);
    expect(await credit()).toBe(before);
    expect((await one("SELECT status FROM payments WHERE order_id = $1", [id])).status).toBe(
      "cancelled",
    );
  });

  it("blocks new terms orders while an invoice is overdue", async () => {
    if (!available) return;
    await q(
      `UPDATE orders SET payment_due_at = now() - interval '2 days' WHERE order_number = $1`,
      [`${tag}-2`],
    );
    const id = await makeOrder(5, 1000, false);
    await expect(service().confirmOrder(id, ids.buyer!)).rejects.toMatchObject({
      code: "NET_TERMS_OVERDUE",
    });
    const rec = await service().listReceivables({ status: "overdue", q: `${tag}-2` });
    expect(rec.items[0]).toMatchObject({ status: "overdue", days_overdue: 2 });
  });

  it("does not confirm another user's order", async () => {
    if (!available) return;
    const id = await makeOrder(6, 1000, false);
    await expect(
      service().confirmOrder(id, "00000000-0000-4000-8000-000000000000"),
    ).rejects.toMatchObject({
      code: "ORDER_NOT_FOUND",
    });
  });
});
