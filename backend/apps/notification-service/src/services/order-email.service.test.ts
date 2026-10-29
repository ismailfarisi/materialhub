import { beforeEach, describe, expect, it, mock } from "bun:test";
import { OrderEmailService } from "./order-email.service.ts";

function makeRepo(rows: any[]) {
  return {
    findOne: mock((opts: any) => {
      const where = opts?.where ?? {};
      const found = rows.find((r) => Object.entries(where).every(([k, v]) => r[k] === v));
      return Promise.resolve(found ?? null);
    }),
    find: mock((opts: any) => {
      const where = opts?.where ?? {};
      return Promise.resolve(
        rows.filter((r) => Object.entries(where).every(([k, v]) => r[k] === v)),
      );
    }),
  };
}

describe("OrderEmailService.sendForConfirmedOrder", () => {
  const order = {
    id: "o1",
    order_number: "FKS-2026-000999",
    user_id: "u1",
    currency: "AED",
    subtotal: 30000,
    discount_total: 0,
    shipping_total: 1500,
    surcharge_total: 0,
    tax_total: 1428,
    grand_total: 31500,
    shipping_address: { first_name: "Sara", city: "Dubai" },
  };
  const items = [
    {
      id: "i1",
      order_id: "o1",
      vendor_order_id: "vo1",
      product_name: "Lipstick",
      variant_name: "Red",
      quantity: 1,
      line_total: 12000,
    },
    {
      id: "i2",
      order_id: "o1",
      vendor_order_id: "vo2",
      product_name: "Serum",
      variant_name: null,
      quantity: 1,
      line_total: 18000,
    },
  ];
  const vendorOrders = [
    {
      id: "vo1",
      order_id: "o1",
      vendor_id: "v1",
      vendor_order_number: "FKS-2026-000999-V1",
      subtotal: 12000,
      currency: "AED",
      processing_deadline: null,
    },
    {
      id: "vo2",
      order_id: "o1",
      vendor_id: "v2",
      vendor_order_number: "FKS-2026-000999-V2",
      subtotal: 18000,
      currency: "AED",
      processing_deadline: null,
    },
  ];
  const vendors = [
    { id: "v1", name: "Gulf Paper Co", contact_email: "v1@example.com" },
    { id: "v2", name: "Prime Boards", contact_email: "v2@example.com" },
  ];
  const users = [{ id: "u1", email: "customer@example.com", first_name: "Sara" }];

  let sent: { to: string; subject: string }[];
  let emailService: any;

  // The ops inbox lives in site_settings (key order_ops_notification_email);
  // "" means disabled. Helper builds a matching settings repo.
  function settingsRepo(opsEmail = "") {
    return makeRepo([{ key: "order_ops_notification_email", value: opsEmail }]);
  }

  function build(payments: any[], members: any[] = [], opsEmail = "") {
    sent = [];
    emailService = {
      sendTransactional: mock((to: string, subject: string) => {
        sent.push({ to, subject });
        return Promise.resolve();
      }),
    };
    return new OrderEmailService(
      makeRepo([order]) as any,
      makeRepo(items) as any,
      makeRepo(vendorOrders) as any,
      makeRepo(vendors) as any,
      makeRepo(members) as any,
      makeRepo(users) as any,
      makeRepo(payments) as any,
      settingsRepo(opsEmail) as any,
      emailService,
      makeRepo([]) as any,
    );
  }

  beforeEach(() => {
    sent = [];
  });

  it("sends one customer email and one email per vendor", async () => {
    const svc = build([{ id: "p1", order_id: "o1", gateway: "stripe", created_at: new Date() }]);
    await svc.sendForConfirmedOrder("o1");

    const recipients = sent.map((s) => s.to).sort();
    expect(recipients).toEqual(["customer@example.com", "v1@example.com", "v2@example.com"]);
  });

  it("gives each vendor only their own line items", async () => {
    const svc = build([{ id: "p1", order_id: "o1", gateway: "stripe", created_at: new Date() }]);
    // Capture full html per recipient
    const htmlByTo: Record<string, string> = {};
    emailService.sendTransactional = mock((to: string, _s: string, html: string) => {
      htmlByTo[to] = html;
      return Promise.resolve();
    });
    await svc.sendForConfirmedOrder("o1");

    expect(htmlByTo["v1@example.com"]).toContain("Lipstick");
    expect(htmlByTo["v1@example.com"]).not.toContain("Serum");
    expect(htmlByTo["v2@example.com"]).toContain("Serum");
    expect(htmlByTo["v2@example.com"]).not.toContain("Lipstick");
  });

  it("detects COD from the payment gateway and uses COD wording", async () => {
    const svc = build([{ id: "p1", order_id: "o1", gateway: "cod", created_at: new Date() }]);
    const htmlByTo: Record<string, string> = {};
    emailService.sendTransactional = mock((to: string, _s: string, html: string) => {
      htmlByTo[to] = html;
      return Promise.resolve();
    });
    await svc.sendForConfirmedOrder("o1");

    expect(htmlByTo["customer@example.com"]).toContain("cash");
    expect(htmlByTo["v1@example.com"]).toContain("Cash on Delivery");
  });

  it("skips a vendor with no contact_email but still emails the others", async () => {
    const svc = new OrderEmailService(
      makeRepo([order]) as any,
      makeRepo(items) as any,
      makeRepo(vendorOrders) as any,
      makeRepo([{ id: "v1", name: "Gulf Paper Co", contact_email: null }, vendors[1]]) as any,
      makeRepo([]) as any,
      makeRepo(users) as any,
      makeRepo([{ id: "p1", order_id: "o1", gateway: "stripe", created_at: new Date() }]) as any,
      settingsRepo() as any,
      {
        sendTransactional: mock((to: string, subject: string) => {
          sent.push({ to, subject });
          return Promise.resolve();
        }),
      } as any,
      makeRepo([]) as any,
    );
    await svc.sendForConfirmedOrder("o1");

    const recipients = sent.map((s) => s.to).sort();
    expect(recipients).toEqual(["customer@example.com", "v2@example.com"]);
  });

  it("also emails active owner/manager/staff members, deduping contact_email and excluding viewers/inactive", async () => {
    const members = [
      {
        id: "m1",
        vendor_id: "v1",
        email: "manager@gulfpaper.com",
        role: "manager",
        status: "active",
      },
      // Same address as v1's contact_email (different case) — must dedupe.
      { id: "m2", vendor_id: "v1", email: "V1@example.com", role: "owner", status: "active" },
      // Viewer role — read-only, must NOT be notified.
      {
        id: "m3",
        vendor_id: "v1",
        email: "viewer@gulfpaper.com",
        role: "viewer",
        status: "active",
      },
      // Pending member — not active yet, must NOT be notified.
      {
        id: "m4",
        vendor_id: "v1",
        email: "pending@gulfpaper.com",
        role: "staff",
        status: "pending",
      },
    ];
    const svc = build(
      [{ id: "p1", order_id: "o1", gateway: "stripe", created_at: new Date() }],
      members,
    );
    await svc.sendForConfirmedOrder("o1");

    const recipients = sent.map((s) => s.to).sort();
    expect(recipients).toEqual([
      "customer@example.com",
      "manager@gulfpaper.com",
      "v1@example.com",
      "v2@example.com",
    ]);
  });

  it("reaches active members even when the vendor has no contact_email", async () => {
    sent = [];
    const svc = new OrderEmailService(
      makeRepo([order]) as any,
      makeRepo(items) as any,
      makeRepo(vendorOrders) as any,
      makeRepo([{ id: "v1", name: "Gulf Paper Co", contact_email: null }, vendors[1]]) as any,
      makeRepo([
        {
          id: "m1",
          vendor_id: "v1",
          email: "owner@gulfpaper.com",
          role: "owner",
          status: "active",
        },
      ]) as any,
      makeRepo(users) as any,
      makeRepo([{ id: "p1", order_id: "o1", gateway: "stripe", created_at: new Date() }]) as any,
      settingsRepo() as any,
      {
        sendTransactional: mock((to: string, subject: string) => {
          sent.push({ to, subject });
          return Promise.resolve();
        }),
      } as any,
      makeRepo([]) as any,
    );
    await svc.sendForConfirmedOrder("o1");

    const recipients = sent.map((s) => s.to).sort();
    expect(recipients).toEqual(["customer@example.com", "owner@gulfpaper.com", "v2@example.com"]);
  });

  it("sends a full-detail ops copy to the configured setting with a [New Order] subject", async () => {
    const svc = build(
      [{ id: "p1", order_id: "o1", gateway: "stripe", created_at: new Date() }],
      [],
      "ops@materialhubuae.com",
    );
    const captured: { to: string; subject: string; html: string }[] = [];
    emailService.sendTransactional = mock((to: string, subject: string, html: string) => {
      captured.push({ to, subject, html });
      return Promise.resolve();
    });
    await svc.sendForConfirmedOrder("o1");

    const ops = captured.find((c) => c.to === "ops@materialhubuae.com");
    expect(ops).toBeDefined();
    expect(ops?.subject).toBe("[New Order] FKS-2026-000999 — AED 315.00 (Card)");
    // Full customer layout reused — line items present.
    expect(ops?.html).toContain("Lipstick");
    expect(ops?.html).toContain("Serum");
  });

  it("sends no ops copy when the setting is blank", async () => {
    const svc = build([{ id: "p1", order_id: "o1", gateway: "stripe", created_at: new Date() }]);
    await svc.sendForConfirmedOrder("o1");
    expect(sent.some((s) => s.to === "ops@materialhubuae.com")).toBe(false);
    expect(sent.map((s) => s.to).sort()).toEqual([
      "customer@example.com",
      "v1@example.com",
      "v2@example.com",
    ]);
  });

  it("still sends the ops copy when the customer has no deliverable email", async () => {
    const svc = new OrderEmailService(
      makeRepo([order]) as any,
      makeRepo(items) as any,
      makeRepo(vendorOrders) as any,
      makeRepo(vendors) as any,
      makeRepo([]) as any,
      makeRepo([{ id: "u1", email: null, first_name: null }]) as any,
      makeRepo([{ id: "p1", order_id: "o1", gateway: "stripe", created_at: new Date() }]) as any,
      settingsRepo("ops@materialhubuae.com") as any,
      {
        sendTransactional: mock((to: string, subject: string) => {
          sent.push({ to, subject });
          return Promise.resolve();
        }),
      } as any,
      makeRepo([]) as any,
    );
    await svc.sendForConfirmedOrder("o1");

    expect(sent.some((s) => s.to === "ops@materialhubuae.com")).toBe(true);
    expect(sent.some((s) => s.to === "customer@example.com")).toBe(false);
  });

  it("does nothing when the order is missing", async () => {
    const svc = build([]);
    await svc.sendForConfirmedOrder("does-not-exist");
    expect(sent.length).toBe(0);
  });
});

describe("OrderEmailService.sendForItemsCancelled", () => {
  const order = {
    id: "o1",
    order_number: "FKS-2026-000999",
    user_id: "u1",
    currency: "AED",
  };
  const user = { id: "u1", email: "customer@example.com", first_name: "Sara" };
  const orderItems = [
    { id: "i1", order_id: "o1", product_name: "Lipstick", variant_name: "Red", quantity: 2 },
    { id: "i2", order_id: "o1", product_name: "Serum", variant_name: null, quantity: 1 },
  ];
  const cancellation = {
    id: "c1",
    order_id: "o1",
    admin_id: "admin1",
    reason: "Out of stock",
    refund_amount: 12000,
    currency: "AED",
    refund_method: "stripe",
    status: "completed",
    items: [{ order_item_id: "i1", vendor_order_id: "vo1", quantity: 1, refund_amount: 12000 }],
  };

  let sent: { to: string; subject: string; html: string }[];

  function build(overrides: { cancellations?: any[]; orders?: any[]; users?: any[] } = {}) {
    sent = [];
    const emailService = {
      sendTransactional: mock((to: string, subject: string, html: string) => {
        sent.push({ to, subject, html });
        return Promise.resolve();
      }),
    };
    const svc = new OrderEmailService(
      makeRepo(overrides.orders ?? [order]) as any,
      makeRepo(orderItems) as any,
      makeRepo([]) as any,
      makeRepo([]) as any,
      makeRepo([]) as any,
      makeRepo(overrides.users ?? [user]) as any,
      makeRepo([]) as any,
      makeRepo([]) as any,
      emailService as any,
      makeRepo(overrides.cancellations ?? [cancellation]) as any,
    );
    return { svc, emailService };
  }

  it("sends the customer a cancellation email naming the order and item", async () => {
    const { svc } = build();
    await svc.sendForItemsCancelled("c1");

    expect(sent.length).toBe(1);
    expect(sent[0]!.to).toBe("customer@example.com");
    expect(sent[0]!.subject).toContain("FKS-2026-000999");
    expect(sent[0]!.html).toContain("Lipstick");
    expect(sent[0]!.html).not.toContain("Serum");
  });

  it("does nothing when the cancellation is missing", async () => {
    const { svc } = build({ cancellations: [] });
    await svc.sendForItemsCancelled("does-not-exist");
    expect(sent.length).toBe(0);
  });

  it("does nothing when the order is missing", async () => {
    const { svc } = build({ orders: [] });
    await svc.sendForItemsCancelled("c1");
    expect(sent.length).toBe(0);
  });

  it("does nothing when the customer has no deliverable email", async () => {
    const { svc } = build({ users: [{ id: "u1", email: null, first_name: "Sara" }] });
    await svc.sendForItemsCancelled("c1");
    expect(sent.length).toBe(0);
  });
});
