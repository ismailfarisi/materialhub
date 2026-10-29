import { describe, expect, it, mock } from "bun:test";
import {
  enqueueAutoShipmentsForOrder,
  handleAutoShipmentFailure,
  processAutoShipmentJob,
  resolveCodAmountFils,
} from "./auto-shipment.job.ts";

function makeVendor(overrides: any = {}) {
  return {
    id: "v1",
    auto_create_shipment: true,
    default_shipping_account_id: "acc-1",
    ...overrides,
  };
}
function makeAccount(overrides: any = {}) {
  return {
    id: "acc-1",
    is_active: true,
    is_verified: true,
    credentials_encrypted: "enc",
    provider: { id: "p1", code: "mock", is_active: true },
    ...overrides,
  };
}
function makeVendorOrder() {
  return {
    id: "vo-1",
    status: "confirmed",
    warehouse_id: "wh-1",
    items: [{ id: "oi-1", product_name: "Thing", quantity: 2 }],
    order: { shipping_address: { city: "Dubai" } },
  };
}

const encryption = {
  decryptObject: mock(() => ({ api_key: "test_x" })),
} as any;

function makeAdapter() {
  return {
    bookShipment: mock(async () => ({
      tracking_number: "TRK-1",
      tracking_url: "url",
      carrier_cost_fils: 900,
      external_shipment_id: "es-1",
      label_url: "label-url",
      pickup_code: "PU-1",
      estimated_delivery_at: new Date("2026-01-02T00:00:00Z"),
    })),
  };
}
function makeRegistry(adapter: any) {
  return { get: mock((code: string) => (code === "mock" ? adapter : null)) } as any;
}

describe("processAutoShipmentJob", () => {
  it("skips when the vendor's account is not verified and no platform account exists", async () => {
    const adapter = makeAdapter();
    const vendorRepo = { findOne: mock(async () => makeVendor()) };
    const accountRepo = {
      findOne: mock(async () => makeAccount({ is_verified: false })),
      find: mock(async () => []),
    };
    await processAutoShipmentJob(
      { orderId: "o1", vendorOrderId: "vo-1", vendorId: "v1" },
      {
        vendorRepo: vendorRepo as any,
        vendorOrderRepo: {} as any,
        accountRepo: accountRepo as any,
        warehouseRepo: { findOne: mock(async () => null) } as any,
        orderStatusService: {} as any,
        shipmentService: {} as any,
        registry: makeRegistry(adapter),
        encryption,
      },
    );
    expect(adapter.bookShipment).not.toHaveBeenCalled();
  });

  it("books via vendor's adapter and advances shipment", async () => {
    const adapter = makeAdapter();
    const vendorRepo = { findOne: mock(async () => makeVendor()) };
    const accountRepo = { findOne: mock(async () => makeAccount()) };
    const vendorOrder = makeVendorOrder();
    const vendorOrderRepo = {
      findOne: mock(async () => vendorOrder),
      update: mock(async () => ({ affected: 1 })),
    };
    const orderStatusService = {
      transitionVendorOrder: mock(async () => undefined),
    };
    const shipmentService = { createShipment: mock(async () => ({})) };

    await processAutoShipmentJob(
      { orderId: "o1", vendorOrderId: "vo-1", vendorId: "v1" },
      {
        vendorRepo: vendorRepo as any,
        vendorOrderRepo: vendorOrderRepo as any,
        accountRepo: accountRepo as any,
        warehouseRepo: { findOne: mock(async () => null) } as any,
        orderStatusService: orderStatusService as any,
        shipmentService: shipmentService as any,
        registry: makeRegistry(adapter),
        encryption,
      },
    );
    expect(adapter.bookShipment).toHaveBeenCalledTimes(1);
    expect(vendorOrderRepo.update).toHaveBeenCalledWith("vo-1", {
      carrier_cost: 900,
      booking_error: null,
    });
    expect(shipmentService.createShipment).toHaveBeenCalled();
  });

  it("passes warehouse pickup details and carrier metadata into shipment creation", async () => {
    const adapter = makeAdapter();
    const vendorRepo = { findOne: mock(async () => makeVendor()) };
    const accountRepo = { findOne: mock(async () => makeAccount()) };
    const vendorOrder = makeVendorOrder();
    const vendorOrderRepo = {
      findOne: mock(async () => vendorOrder),
      update: mock(async () => ({ affected: 1 })),
    };
    const orderStatusService = {
      transitionVendorOrder: mock(async () => undefined),
    };
    const shipmentService = { createShipment: mock(async () => ({})) };
    const warehouseRepo = {
      findOne: mock(async () => ({
        id: "wh-1",
        name: "Main Warehouse",
        address_line_1: "Warehouse Street",
        city: "Dubai",
        emirate: "DU",
        country_code: "AE",
        contact_phone: "971501234567",
        contact_email: "ops@example.com",
        operating_hours: {
          postaplus: {
            city_code: "CITY415668",
            area_code: "AREA1198",
          },
        },
      })),
    };

    await processAutoShipmentJob(
      { orderId: "o1", vendorOrderId: "vo-1", vendorId: "v1" },
      {
        vendorRepo: vendorRepo as any,
        vendorOrderRepo: vendorOrderRepo as any,
        accountRepo: accountRepo as any,
        warehouseRepo: warehouseRepo as any,
        orderStatusService: orderStatusService as any,
        shipmentService: shipmentService as any,
        registry: makeRegistry(adapter),
        encryption,
      },
    );

    expect(adapter.bookShipment).toHaveBeenCalledWith(
      expect.objectContaining({
        shipperAddress: expect.objectContaining({
          name: "Main Warehouse",
          address_line_1: "Warehouse Street",
          city_code: "CITY415668",
          area_code: "AREA1198",
        }),
        pickupAddress: expect.objectContaining({
          name: "Main Warehouse",
          city_code: "CITY415668",
          area_code: "AREA1198",
        }),
      }),
      expect.any(Object),
    );
    expect(shipmentService.createShipment).toHaveBeenCalledWith(
      "vo-1",
      "v1",
      expect.objectContaining({
        auto_booked: true,
        tracking_url: "url",
        label_url: "label-url",
        pickup_code: "PU-1",
        estimated_delivery_at: "2026-01-02T00:00:00.000Z",
      }),
    );
  });

  it("passes COD payment amount to the carrier booking request", async () => {
    const adapter = makeAdapter();
    const vendorRepo = { findOne: mock(async () => makeVendor()) };
    const accountRepo = { findOne: mock(async () => makeAccount()) };
    const vendorOrder = {
      ...makeVendorOrder(),
      order: {
        shipping_address: { city: "Dubai" },
        grand_total: 27_500,
        payments: [
          {
            payment_method: "cash_on_delivery",
            gateway: "cod",
            amount: 27_500,
          },
        ],
      },
    };
    const vendorOrderRepo = {
      findOne: mock(async () => vendorOrder),
      update: mock(async () => ({ affected: 1 })),
    };
    const orderStatusService = {
      transitionVendorOrder: mock(async () => undefined),
    };
    const shipmentService = { createShipment: mock(async () => ({})) };

    await processAutoShipmentJob(
      { orderId: "o1", vendorOrderId: "vo-1", vendorId: "v1" },
      {
        vendorRepo: vendorRepo as any,
        vendorOrderRepo: vendorOrderRepo as any,
        accountRepo: accountRepo as any,
        warehouseRepo: { findOne: mock(async () => null) } as any,
        orderStatusService: orderStatusService as any,
        shipmentService: shipmentService as any,
        registry: makeRegistry(adapter),
        encryption,
      },
    );

    expect(vendorOrderRepo.findOne).toHaveBeenCalledWith({
      where: { id: "vo-1" },
      relations: ["items", "order", "order.payments", "order.user"],
    });
    expect(adapter.bookShipment).toHaveBeenCalledWith(
      expect.objectContaining({
        codAmountFils: 27_500,
      }),
      expect.any(Object),
    );
  });

  it("enqueueAutoShipmentsForOrder adds one deduped job per vendor sub-order", async () => {
    const vendorOrderRepo = {
      find: mock(async () => [
        { id: "vo-1", vendor_id: "v1" },
        { id: "vo-2", vendor_id: "v2" },
      ]),
    };
    const queue = { add: mock(async () => ({})) };

    await enqueueAutoShipmentsForOrder("o1", vendorOrderRepo as any, queue as any);

    expect(vendorOrderRepo.find).toHaveBeenCalledWith({ where: { order_id: "o1" } });
    expect(queue.add).toHaveBeenCalledTimes(2);
    expect(queue.add).toHaveBeenCalledWith(
      "auto-shipment",
      { orderId: "o1", vendorOrderId: "vo-1", vendorId: "v1" },
      { jobId: "auto-ship-vo-1" },
    );
    expect(queue.add).toHaveBeenCalledWith(
      "auto-shipment",
      { orderId: "o1", vendorOrderId: "vo-2", vendorId: "v2" },
      { jobId: "auto-ship-vo-2" },
    );
  });

  it("falls back to the platform carrier account when the vendor has no own account", async () => {
    const adapter = makeAdapter();
    const vendorRepo = {
      findOne: mock(async () => makeVendor({ default_shipping_account_id: null })),
    };
    // findOne serves vendor-default lookups (unused here); find serves the
    // platform-account lookup.
    const accountRepo = {
      findOne: mock(async () => null),
      find: mock(async () => [makeAccount({ id: "platform-acc", vendor_id: null })]),
    };
    const vendorOrderRepo = {
      findOne: mock(async () => makeVendorOrder()),
      update: mock(async () => ({ affected: 1 })),
    };
    const orderStatusService = {
      transitionVendorOrder: mock(async () => undefined),
    };
    const shipmentService = { createShipment: mock(async () => ({})) };

    await processAutoShipmentJob(
      { orderId: "o1", vendorOrderId: "vo-1", vendorId: "v1" },
      {
        vendorRepo: vendorRepo as any,
        vendorOrderRepo: vendorOrderRepo as any,
        accountRepo: accountRepo as any,
        warehouseRepo: { findOne: mock(async () => null) } as any,
        orderStatusService: orderStatusService as any,
        shipmentService: shipmentService as any,
        registry: makeRegistry(adapter),
        encryption,
      },
    );
    expect(adapter.bookShipment).toHaveBeenCalledTimes(1);
    expect(accountRepo.find).toHaveBeenCalled();
  });

  it("prefers the vendor's own default account over the platform account", async () => {
    const adapter = makeAdapter();
    const vendorRepo = { findOne: mock(async () => makeVendor()) };
    const accountRepo = {
      findOne: mock(async () => makeAccount()),
      find: mock(async () => [makeAccount({ id: "platform-acc", vendor_id: null })]),
    };
    const vendorOrderRepo = {
      findOne: mock(async () => makeVendorOrder()),
      update: mock(async () => ({ affected: 1 })),
    };
    const orderStatusService = {
      transitionVendorOrder: mock(async () => undefined),
    };
    const shipmentService = { createShipment: mock(async () => ({})) };

    await processAutoShipmentJob(
      { orderId: "o1", vendorOrderId: "vo-1", vendorId: "v1" },
      {
        vendorRepo: vendorRepo as any,
        vendorOrderRepo: vendorOrderRepo as any,
        accountRepo: accountRepo as any,
        warehouseRepo: { findOne: mock(async () => null) } as any,
        orderStatusService: orderStatusService as any,
        shipmentService: shipmentService as any,
        registry: makeRegistry(adapter),
        encryption,
      },
    );
    expect(adapter.bookShipment).toHaveBeenCalledTimes(1);
    expect(accountRepo.find).not.toHaveBeenCalled();
  });

  it("skips when neither a vendor account nor a platform account is usable", async () => {
    const adapter = makeAdapter();
    const vendorRepo = {
      findOne: mock(async () => makeVendor({ default_shipping_account_id: null })),
    };
    const accountRepo = {
      findOne: mock(async () => null),
      find: mock(async () => []),
    };
    await processAutoShipmentJob(
      { orderId: "o1", vendorOrderId: "vo-1", vendorId: "v1" },
      {
        vendorRepo: vendorRepo as any,
        vendorOrderRepo: {} as any,
        accountRepo: accountRepo as any,
        warehouseRepo: { findOne: mock(async () => null) } as any,
        orderStatusService: {} as any,
        shipmentService: {} as any,
        registry: makeRegistry(adapter),
        encryption,
      },
    );
    expect(adapter.bookShipment).not.toHaveBeenCalled();
  });

  it("skips vendors that opted out of auto shipment unless the job is manual", async () => {
    const adapter = makeAdapter();
    const vendorRepo = {
      findOne: mock(async () => makeVendor({ auto_create_shipment: false })),
    };
    const accountRepo = { findOne: mock(async () => makeAccount()) };
    const vendorOrderRepo = {
      findOne: mock(async () => makeVendorOrder()),
      update: mock(async () => ({ affected: 1 })),
    };
    const orderStatusService = {
      transitionVendorOrder: mock(async () => undefined),
    };
    const shipmentService = { createShipment: mock(async () => ({})) };
    const deps = {
      vendorRepo: vendorRepo as any,
      vendorOrderRepo: vendorOrderRepo as any,
      accountRepo: accountRepo as any,
      warehouseRepo: { findOne: mock(async () => null) } as any,
      orderStatusService: orderStatusService as any,
      shipmentService: shipmentService as any,
      registry: makeRegistry(adapter),
      encryption,
    };

    await processAutoShipmentJob({ orderId: "o1", vendorOrderId: "vo-1", vendorId: "v1" }, deps);
    expect(adapter.bookShipment).not.toHaveBeenCalled();

    await processAutoShipmentJob(
      { orderId: "o1", vendorOrderId: "vo-1", vendorId: "v1", manual: true },
      deps,
    );
    expect(adapter.bookShipment).toHaveBeenCalledTimes(1);
  });

  it("injects the customer's account email into the ship-to address when the snapshot lacks one", async () => {
    const adapter = makeAdapter();
    const vendorRepo = { findOne: mock(async () => makeVendor()) };
    const accountRepo = { findOne: mock(async () => makeAccount()) };
    const vendorOrder = {
      ...makeVendorOrder(),
      order: {
        shipping_address: { city: "Dubai", first_name: "Aisha" },
        user: { email: "buyer@example.com" },
      },
    };
    const vendorOrderRepo = {
      findOne: mock(async () => vendorOrder),
      update: mock(async () => ({ affected: 1 })),
    };
    const orderStatusService = {
      transitionVendorOrder: mock(async () => undefined),
    };
    const shipmentService = { createShipment: mock(async () => ({})) };

    await processAutoShipmentJob(
      { orderId: "o1", vendorOrderId: "vo-1", vendorId: "v1" },
      {
        vendorRepo: vendorRepo as any,
        vendorOrderRepo: vendorOrderRepo as any,
        accountRepo: accountRepo as any,
        warehouseRepo: { findOne: mock(async () => null) } as any,
        orderStatusService: orderStatusService as any,
        shipmentService: shipmentService as any,
        registry: makeRegistry(adapter),
        encryption,
      },
    );

    expect(adapter.bookShipment).toHaveBeenCalledWith(
      expect.objectContaining({
        shippingAddress: expect.objectContaining({ email: "buyer@example.com" }),
      }),
      expect.any(Object),
    );
  });

  it("handleAutoShipmentFailure persists the reason on the final attempt only", async () => {
    const vendorOrderRepo = { update: mock(async () => ({ affected: 1 })) };
    const err = new Error(
      "PostaPlus shipment requires a shipperAddress with PostaPlus location codes",
    );

    await handleAutoShipmentFailure(
      {
        data: { orderId: "o1", vendorOrderId: "vo-1", vendorId: "v1" },
        attemptsMade: 1,
        opts: { attempts: 3 },
      } as any,
      err,
      vendorOrderRepo as any,
    );
    expect(vendorOrderRepo.update).not.toHaveBeenCalled();

    await handleAutoShipmentFailure(
      {
        data: { orderId: "o1", vendorOrderId: "vo-1", vendorId: "v1" },
        attemptsMade: 3,
        opts: { attempts: 3 },
      } as any,
      err,
      vendorOrderRepo as any,
    );
    expect(vendorOrderRepo.update).toHaveBeenCalledWith("vo-1", {
      booking_error: "PostaPlus shipment requires a shipperAddress with PostaPlus location codes",
    });
  });

  it("handleAutoShipmentFailure tolerates undefined jobs and repo failures", async () => {
    const vendorOrderRepo = {
      update: mock(async () => {
        throw new Error("db down");
      }),
    };
    await handleAutoShipmentFailure(undefined, new Error("boom"), vendorOrderRepo as any);
    expect(vendorOrderRepo.update).not.toHaveBeenCalled();

    // final attempt with a failing repo must not throw
    await handleAutoShipmentFailure(
      {
        data: { orderId: "o1", vendorOrderId: "vo-1", vendorId: "v1" },
        attemptsMade: 3,
        opts: { attempts: 3 },
      } as any,
      new Error("boom"),
      vendorOrderRepo as any,
    );
  });
});

describe("resolveCodAmountFils", () => {
  function codOrder(amount: number, refundTotal = 0) {
    return {
      refund_total: refundTotal,
      payments: [{ payment_method: "cash_on_delivery", gateway: "cod", amount }],
    };
  }

  it("returns the COD payment amount when there are no refunds", () => {
    expect(resolveCodAmountFils(codOrder(27_500))).toBe(27_500);
  });

  it("subtracts refund_total from the COD amount", () => {
    expect(resolveCodAmountFils(codOrder(27_500, 10_000))).toBe(17_500);
  });

  it("clamps at 0 and returns undefined when refunds meet or exceed the COD amount", () => {
    expect(resolveCodAmountFils(codOrder(27_500, 27_500))).toBeUndefined();
    expect(resolveCodAmountFils(codOrder(27_500, 40_000))).toBeUndefined();
  });

  it("returns undefined when there is no COD payment", () => {
    expect(
      resolveCodAmountFils({
        refund_total: 0,
        payments: [{ payment_method: "card", gateway: "stripe", amount: 27_500 }],
      }),
    ).toBeUndefined();
  });

  it("returns undefined when order/payments are missing", () => {
    expect(resolveCodAmountFils({})).toBeUndefined();
    expect(resolveCodAmountFils(undefined)).toBeUndefined();
  });
});
