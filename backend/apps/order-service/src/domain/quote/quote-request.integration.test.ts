/**
 * RFQ end to end against a real Postgres (the migrated schema).
 *
 * Skipped when no database is reachable, like the other integration tests.
 * Run locally with the docker compose Postgres, then `bun test`.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
  AppDataSource,
  Cart,
  CartItem,
  Inventory,
  Product,
  ProductVariant,
  QuoteMessage,
  QuoteRequest,
  QuoteRequestVendor,
  QuoteResponse,
  QuoteStatusHistory,
  Vendor,
  VendorMember,
} from "@materialhub/database";
import { CartService } from "../cart/cart.service.ts";
import { QuoteRequestService } from "./quote-request.service.ts";

let dbUp = false;
try {
  await AppDataSource.setOptions({ logging: false }).initialize();
  await AppDataSource.query("SELECT 1 FROM quote_requests LIMIT 1");
  dbUp = true;
} catch {
  dbUp = false;
}

const suite = dbUp ? describe : describe.skip;
const tag = `rfqtest${Date.now()}`;
const sent: any[] = [];
// Results are asserted structurally; `any` keeps the assertions readable.
let service: any;
let cartService: CartService;
type IdKey =
  | "buyer"
  | "vendorUserA"
  | "vendorUserB"
  | "vendorA"
  | "vendorB"
  | "vendorC"
  | "category"
  | "productA"
  | "productB";
const ids = {} as Record<IdKey, string>;

async function insert(table: string, row: Record<string, unknown>): Promise<string> {
  const cols = Object.keys(row);
  const vals = Object.values(row).map((v) =>
    v !== null && typeof v === "object" ? JSON.stringify(v) : v,
  );
  const [r] = await AppDataSource.query(
    `INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(",")}) VALUES (${cols
      .map((_, i) => `$${i + 1}`)
      .join(",")}) RETURNING id`,
    vals,
  );
  return r.id;
}

function plusDays(days: number): string {
  return new Date(Date.now() + 4 * 3600_000 + days * 86_400_000).toISOString().slice(0, 10);
}

suite("QuoteRequestService (Postgres)", () => {
  beforeAll(async () => {
    const user = (n: string) =>
      insert("users", {
        first_name: n,
        last_name: "Tester",
        email: `${n.toLowerCase()}.${tag}@materialhub.test`,
        password_hash: "x",
        role: "customer",
      });
    ids.buyer = await user("Buyer");
    ids.vendorUserA = await user("SupplierA");
    ids.vendorUserB = await user("SupplierB");
    const vendor = (n: string) =>
      insert("vendors", {
        name: `${n} Board Trading`,
        slug: `${n.toLowerCase()}-${tag}`,
        business_name: `${n} Board Trading LLC`,
        business_type: "llc",
        contact_email: `${n.toLowerCase()}.${tag}@materialhub.test`,
        contact_phone: "+971500000000",
        status: "approved",
      });
    ids.vendorA = await vendor("Alpha");
    ids.vendorB = await vendor("Beta");
    ids.vendorC = await vendor("Gamma");
    await insert("vendor_members", {
      vendor_id: ids.vendorA,
      user_id: ids.vendorUserA,
      email: `a.${tag}@materialhub.test`,
      role: "owner",
      status: "active",
    });
    await insert("vendor_members", {
      vendor_id: ids.vendorB,
      user_id: ids.vendorUserB,
      email: `b.${tag}@materialhub.test`,
      role: "owner",
      status: "active",
    });
    ids.category = await insert("categories", { name: "Greyboard", slug: `greyboard-${tag}` });
    const product = (vendorId: string, n: string, price: number) =>
      insert("products", {
        vendor_id: vendorId,
        category_id: ids.category,
        name: n,
        slug: `${n.toLowerCase().replace(/\W+/g, "-")}-${tag}`,
        price,
        status: "published",
      });
    ids.productA = await product(ids.vendorA, "Greyboard 2.0 mm 70x100 A", 480);
    ids.productB = await product(ids.vendorB, "Greyboard 2.0 mm 70x100 B", 510);

    const fakeRedis: any = {
      setItem: async () => {},
      removeItem: async () => {},
      clear: async () => {},
    };
    cartService = new CartService(
      AppDataSource.getRepository(Cart),
      AppDataSource.getRepository(CartItem),
      AppDataSource.getRepository(Inventory),
      AppDataSource.getRepository(Product),
      AppDataSource.getRepository(ProductVariant),
      fakeRedis,
      AppDataSource.getRepository(QuoteResponse),
    );
    service = new QuoteRequestService(
      AppDataSource,
      AppDataSource.getRepository(QuoteRequest),
      AppDataSource.getRepository(QuoteRequestVendor),
      AppDataSource.getRepository(QuoteResponse),
      AppDataSource.getRepository(QuoteMessage),
      AppDataSource.getRepository(QuoteStatusHistory),
      AppDataSource.getRepository(Vendor),
      AppDataSource.getRepository(VendorMember),
      AppDataSource.getRepository(Product),
      AppDataSource.getRepository(ProductVariant),
      cartService,
      { add: async (_name: string, data: unknown) => sent.push(data) },
      {
        getQuoteAttachmentSignedUrl: async (key: string) => ({
          url: `https://signed/${key}`,
          expiresAt: new Date(),
        }),
      },
    );
  });

  afterAll(async () => {
    if (!dbUp) return;
    await AppDataSource.query(
      "DELETE FROM cart_items WHERE cart_id IN (SELECT id FROM carts WHERE user_id = $1)",
      [ids.buyer],
    );
    await AppDataSource.query("DELETE FROM carts WHERE user_id = $1", [ids.buyer]);
    await AppDataSource.query("DELETE FROM quote_requests WHERE buyer_id = $1", [ids.buyer]);
    await AppDataSource.query("DELETE FROM products WHERE vendor_id IN ($1, $2)", [
      ids.vendorA,
      ids.vendorB,
    ]);
    await AppDataSource.query("DELETE FROM categories WHERE id = $1", [ids.category]);
    await AppDataSource.query("DELETE FROM vendor_members WHERE vendor_id IN ($1, $2)", [
      ids.vendorA,
      ids.vendorB,
    ]);
    await AppDataSource.query("DELETE FROM vendors WHERE id IN ($1, $2, $3)", [
      ids.vendorA,
      ids.vendorB,
      ids.vendorC,
    ]);
    await AppDataSource.query("DELETE FROM users WHERE id IN ($1, $2, $3)", [
      ids.buyer,
      ids.vendorUserA,
      ids.vendorUserB,
    ]);
    await AppDataSource.destroy();
  });

  const baseInput = () => ({
    specification: "Greyboard 2.0 mm, 70 × 100 cm, grain long, 1,000 sheets on a pallet",
    quantity: 1000,
    unit: "sheet",
    delivery_emirate: "Dubai",
    need_by: plusDays(14),
  });

  it("rejects more than three suppliers", async () => {
    const fourth = await insert("vendors", {
      name: "Delta",
      slug: `delta-${tag}`,
      business_name: "Delta LLC",
      business_type: "llc",
      contact_email: `d.${tag}@materialhub.test`,
      contact_phone: "+971500000001",
      status: "approved",
    });
    await expect(
      service.create(ids.buyer, {
        ...baseInput(),
        vendor_ids: [ids.vendorA, ids.vendorB, ids.vendorC, fourth],
      }),
    ).rejects.toThrow(/at most 3/);
    await AppDataSource.query("DELETE FROM vendors WHERE id = $1", [fourth]);
  });

  it("runs the full flow: request, two quotes, compare, accept, cart", async () => {
    sent.length = 0;
    const created = await service.create(ids.buyer, {
      ...baseInput(),
      product_id: ids.productA,
      vendor_ids: [ids.vendorB],
      attachments: [
        {
          key: "private/quotes/abc/dieline.pdf",
          filename: "dieline.pdf",
          content_type: "application/pdf",
        },
      ],
    });
    expect(created.request_number).toMatch(/^RFQ-\d{4}-\d{6}$/);
    expect(created.status).toBe("open");
    // The product's own supplier is always included.
    expect(created.suppliers.map((s: any) => s.vendor.id).sort()).toEqual(
      [ids.vendorA, ids.vendorB].sort(),
    );
    expect(sent.filter((e) => e.notificationType === "quote_request_received")).toHaveLength(2);

    const linkA = created.suppliers.find((s: any) => s.vendor.id === ids.vendorA).id;
    const linkB = created.suppliers.find((s: any) => s.vendor.id === ids.vendorB).id;

    // A supplier can't quote another supplier's listing.
    await expect(
      service.respond(ids.vendorA, ids.vendorUserA, linkA, {
        product_id: ids.productB,
        unit_price: 365,
        moq: 500,
        lead_time_days: 7,
        valid_until: plusDays(10),
      }),
    ).rejects.toThrow(/your own listings/);

    await service.respond(ids.vendorA, ids.vendorUserA, linkA, {
      product_id: ids.productA,
      unit_price: 380,
      moq: 500,
      lead_time_days: 5,
      valid_until: plusDays(10),
    });
    // Revision supersedes the first response.
    const vendorView = await service.respond(ids.vendorA, ids.vendorUserA, linkA, {
      product_id: ids.productA,
      unit_price: 365,
      moq: 500,
      lead_time_days: 5,
      valid_until: plusDays(10),
      notes: "Price holds for full pallets.",
    });
    expect(vendorView.responses.map((r: any) => r.status)).toEqual(["submitted", "superseded"]);

    await service.respond(ids.vendorB, ids.vendorUserB, linkB, {
      product_id: ids.productB,
      unit_price: 420,
      moq: 1200,
      lead_time_days: 3,
      valid_until: plusDays(7),
    });

    // Vendors never see each other's responses.
    const viewB = await service.getForVendor(ids.vendorB, linkB);
    expect(viewB.responses.every((r: any) => r.unit_price !== 365)).toBe(true);
    await expect(service.getForVendor(ids.vendorB, linkA)).rejects.toThrow(/not found/);

    const buyerView = await service.getForBuyer(ids.buyer, created.id);
    expect(buyerView.status).toBe("quoted");
    const sa = buyerView.suppliers.find((s: any) => s.id === linkA);
    expect(sa.current_response.unit_price).toBe(365);
    expect(sa.current_response.total).toBe(365 * 1000);
    expect(sa.can_accept).toBe(true);
    const sb = buyerView.suppliers.find((s: any) => s.id === linkB);
    // MOQ above the requested quantity raises the order quantity.
    expect(sb.current_response.order_quantity).toBe(1200);

    // Thread per pair.
    await service.buyerMessage(ids.buyer, created.id, linkA, { body: "Can you do grain short?" });
    await service.vendorMessage(ids.vendorA, ids.vendorUserA, linkA, { body: "Yes, same price." });
    const withThread = await service.getForBuyer(ids.buyer, created.id);
    expect(withThread.suppliers.find((s: any) => s.id === linkA).messages).toHaveLength(2);
    expect(withThread.suppliers.find((s: any) => s.id === linkB).messages).toHaveLength(0);

    // Attachment URLs only for parties to the request.
    const signed = await service.attachmentUrl(
      { role: "vendor", vendorId: ids.vendorB },
      created.id,
      "private/quotes/abc/dieline.pdf",
    );
    expect(signed.url).toContain("private/quotes/abc/dieline.pdf");
    await expect(
      service.attachmentUrl(
        { role: "vendor", vendorId: ids.vendorC },
        created.id,
        "private/quotes/abc/dieline.pdf",
      ),
    ).rejects.toThrow(/not found/);

    // Accept supplier A: cart line at the quoted price, others not selected.
    const accepted = await service.accept(ids.buyer, created.id, linkA);
    expect(accepted.cart_item?.unit_price).toBe(365);
    expect(accepted.cart_item?.quantity).toBe(1000);
    expect(accepted.request.status).toBe("accepted");
    expect(accepted.request.suppliers.find((s: any) => s.id === linkB).status).toBe("not_selected");
    expect(sent.some((e) => e.notificationType === "quote_accepted")).toBe(true);

    const [line] = await AppDataSource.query(
      `SELECT ci.unit_price, ci.quoted_unit_price, ci.quote_id, ci.original_unit_price
         FROM cart_items ci JOIN carts c ON c.id = ci.cart_id
        WHERE c.user_id = $1 AND ci.product_id = $2 AND ci.deleted_at IS NULL`,
      [ids.buyer, ids.productA],
    );
    expect(line.unit_price).toBe(365);
    expect(line.quoted_unit_price).toBe(365);
    expect(line.original_unit_price).toBe(480);
    expect(line.quote_id).toBe(accepted.request.accepted_response_id);

    // Accepting again is a no-op (idempotent), accepting the other supplier is refused.
    const replay = await service.accept(ids.buyer, created.id, linkA);
    expect(replay.cart_item).toBeNull();
    await expect(service.accept(ids.buyer, created.id, linkB)).rejects.toThrow(
      /already has an accepted quote/,
    );

    // The quoted price holds only at or above the MOQ.
    await expect(
      cartService.updateItemQuantity(ids.buyer, null, ids.productA, 100),
    ).rejects.toThrow(/at least 500/);
    const cart = await cartService.getCart(ids.buyer, null);
    expect(cart.staleItems).toHaveLength(0);

    const history = (await service.getForBuyer(ids.buyer, created.id)).history.map(
      (h: any) => `${h.subject}:${h.to_status}`,
    );
    expect(history).toContain("request:open");
    expect(history).toContain("request:quoted");
    expect(history).toContain("request:accepted");
    expect(history).toContain("response:superseded");
  });

  it("refuses to accept an expired quote", async () => {
    const created = await service.create(ids.buyer, { ...baseInput(), vendor_ids: [ids.vendorB] });
    const link = created.suppliers[0].id;
    await service.respond(ids.vendorB, ids.vendorUserB, link, {
      product_id: ids.productB,
      unit_price: 400,
      moq: 100,
      lead_time_days: 2,
      valid_until: plusDays(1),
    });
    // Age the quote past its validity directly; the API won't accept a past date.
    await AppDataSource.query(
      `UPDATE quote_responses SET valid_until = (now() AT TIME ZONE 'Asia/Dubai')::date - 1
        WHERE quote_request_vendor_id = $1`,
      [link],
    );
    const view = await service.getForBuyer(ids.buyer, created.id);
    expect(view.suppliers[0].current_response.display_state).toBe("expired");
    expect(view.suppliers[0].can_accept).toBe(false);
    await expect(service.accept(ids.buyer, created.id, link)).rejects.toThrow(/expired/);
  });

  it("closes a request when every supplier declines, and stops buyer cancel afterwards", async () => {
    const created = await service.create(ids.buyer, { ...baseInput(), vendor_ids: [ids.vendorB] });
    const view = await service.vendorDecline(
      ids.vendorB,
      ids.vendorUserB,
      created.suppliers[0].id,
      "Out of 2.0 mm",
    );
    expect(view.status).toBe("vendor_declined");
    const buyerView = await service.getForBuyer(ids.buyer, created.id);
    expect(buyerView.status).toBe("closed");
    expect(buyerView.suppliers[0].decline_reason).toBe("Out of 2.0 mm");
    await expect(service.cancel(ids.buyer, created.id)).rejects.toThrow(/closed/);
  });

  it("lets the buyer decline, the supplier re-quote, and the buyer cancel", async () => {
    const created = await service.create(ids.buyer, { ...baseInput(), vendor_ids: [ids.vendorB] });
    const link = created.suppliers[0].id;
    const quote = {
      product_id: ids.productB,
      unit_price: 450,
      moq: 100,
      lead_time_days: 4,
      valid_until: plusDays(5),
    };
    await service.respond(ids.vendorB, ids.vendorUserB, link, quote);
    const declined = await service.decline(ids.buyer, created.id, link, "Too high for this run");
    expect(declined.suppliers[0].status).toBe("buyer_declined");
    expect(declined.suppliers[0].can_accept).toBe(false);
    await service.respond(ids.vendorB, ids.vendorUserB, link, { ...quote, unit_price: 410 });
    const requoted = await service.getForBuyer(ids.buyer, created.id);
    expect(requoted.suppliers[0].status).toBe("responded");
    expect(requoted.suppliers[0].can_accept).toBe(true);
    const cancelled = await service.cancel(ids.buyer, created.id);
    expect(cancelled.status).toBe("cancelled");
    await expect(
      service.vendorMessage(ids.vendorB, ids.vendorUserB, link, { body: "Still there?" }),
    ).rejects.toThrow(/closed/);
  });

  it("lists for buyer, vendor and admin", async () => {
    const buyerList = await service.listForBuyer(ids.buyer, {});
    expect(buyerList.total).toBeGreaterThanOrEqual(4);
    const vendorList = await service.listForVendor(ids.vendorB, { status: "responded" });
    expect(vendorList.data.every((r: any) => r.status === "responded")).toBe(true);
    expect(vendorList.data[0]?.request.buyer.display_name).toBe("Buyer T.");
    const adminList = await service.listForAdmin({ q: tag });
    expect(adminList.data.length).toBeGreaterThanOrEqual(4);
    expect(adminList.data[0].buyer.email).toContain(tag);
  });
});
