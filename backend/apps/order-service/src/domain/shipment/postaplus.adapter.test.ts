import { afterEach, describe, expect, it, mock } from "bun:test";
import { ShipmentStatus } from "@materialhub/database/src/enums/order.enums.ts";
import { PostaPlusAdapter } from "./postaplus.adapter.ts";

const adapter = new PostaPlusAdapter();
const creds = {
  partner_key: "partner-1",
  tenant: "DXB",
  customer: "CR26006559",
  created_by: "POSTACLNT",
  shipment_type: "SHPT2",
  package_type: "NA",
  service: "SRV1",
  vehicle: "VHTY1",
  pickup_type: "NM",
  base_url: "https://devinfolink.postaplus.net/api",
};
const params = {
  vendorOrderId: "vo-1",
  items: [{ productName: "Serum", quantity: 2, weightGrams: 650 }],
  shippingAddress: {
    name: "Consignee Name UAE",
    company_name: "Consignee CompanyName",
    country_code: "AE",
    province_code: "DU",
    city_code: "CITY415673",
    area_code: "AREA404",
    address_line_1: "Address Detail Consignee UAE",
    building_name_or_number: "Consignee Building 2",
    street_name_or_number: "Consignee Street 002",
    block_or_district: "Consignee Block B",
    postal_code: "88888888",
    phone: "971501234567",
    additional_number: "",
    civil_id: "7777777",
    email: "test@gmail.com",
  },
  shipperAddress: {
    name: "Shipper Name",
    phone: "971501234567",
    country_code: "AE",
    province_code: "AZ",
    city_code: "CITY415668",
    area_code: "AREA1198",
    address_line_1: "Address Detail Shipper UAE",
    building_name_or_number: "Shipper Building 2",
    street_name_or_number: "Shipper Street 002",
    block_or_district: "Shipper Block B",
    postal_code: "9999999999",
  },
  pickupAddress: {
    name: "PUContact Name",
    company_name: "Pickup CompanyName",
    phone: "971501234567",
    country_code: "AE",
    province_code: "DU",
    city_code: "CITY415679",
    area_code: "AREA531",
    address_line_1: "Address Detail Pickup UAE",
    building_name_or_number: "Pickup Building 2",
    street_name_or_number: "Pickup Street 002",
    block_or_district: "Pickup Block B",
    postal_code: "888888888",
    civil_id: "6666666666666",
    email: "test_pickup@gmail.com",
  },
  codAmountFils: 26000,
  pickupDate: "2025-11-02T00:00:00",
  pickupStart: "18:00:00.0000000",
  pickupEnd: "22:00:00.0000000",
};

describe("PostaPlusAdapter", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("exposes code, displayName, credentialSchema", () => {
    expect(adapter.code).toBe("postaplus");
    expect(adapter.credentialSchema.required).toEqual([
      "partner_key",
      "tenant",
      "customer",
      "created_by",
    ]);
  });

  it("bookShipment creates shipment and pickup in a single PostaPlus call", async () => {
    let capturedUrl = "";
    let capturedBody: any;
    globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedBody = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          airWaybill: "102300188735",
          estimatedTimeOfArrival: "2025-11-04T06:10:00Z",
          labelPrintDownloadUrl: "https://labels.postaplus.test/102300188735.pdf",
          pickupCode: "PU230402334",
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }) as any;
    const res = await adapter.bookShipment(params, creds);
    expect(capturedUrl).toBe(
      "https://devinfolink.postaplus.net/api/Xchanges/CreateShipmentWithPickup",
    );
    expect(capturedBody.shipmentCommand.customer).toBe("CR26006559");
    expect(capturedBody.shipmentCommand.codAmount).toBe(260);
    expect(capturedBody.shipmentCommand.isCod).toBe(true);
    expect(capturedBody.shipmentCommand.actualWeight).toBe(1.3);
    expect(capturedBody.shipmentCommand.shipper.shipperName).toBe("Shipper Name");
    expect(capturedBody.shipmentCommand.consignee.name).toBe("Consignee Name UAE");
    expect(capturedBody.pickupCommand.PickupDate).toBe("2025-11-02T00:00:00");
    expect(capturedBody.pickupCommand.consignee.addressLine).toBe("Address Detail Pickup UAE");
    expect(res.tracking_number).toBe("102300188735");
    expect(res.external_shipment_id).toBe("102300188735");
    expect(res.label_url).toBe("https://labels.postaplus.test/102300188735.pdf");
    expect(res.pickup_code).toBe("PU230402334");
    expect(res.estimated_delivery_at?.toISOString()).toBe("2025-11-04T06:10:00.000Z");
  });

  it("maps customer building_name/apartment/floor into the consignee (no dedicated apt/floor slot)", async () => {
    let capturedBody: any;
    globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ airWaybill: "AWB1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as any;

    await adapter.bookShipment(
      {
        ...params,
        shippingAddress: {
          name: "Sara",
          country_code: "AE",
          city: "Dubai",
          area: "Marina",
          address_line_1: "Marina Walk",
          building_name: "Marina Tower",
          apartment: "1203",
          floor: "12",
          phone: "971500000000",
          email: "sara@example.com",
        },
      },
      creds,
    );

    const consignee = capturedBody.shipmentCommand.consignee;
    expect(consignee.BuildingNameOrNumber).toBe("Marina Tower");
    expect(consignee.addressLine).toBe("Marina Walk, Apt 1203, Floor 12");
  });

  it("bookShipment authenticates with the PartnerKey header and requests a synchronous response", async () => {
    let capturedHeaders: Record<string, string> = {};
    globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
      capturedHeaders = (init?.headers ?? {}) as Record<string, string>;
      return new Response(JSON.stringify({ airWaybill: "102300188735" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as any;
    await adapter.bookShipment(params, creds);
    expect(capturedHeaders.PartnerKey).toBe("partner-1");
    expect(capturedHeaders.WaitResponse).toBe("0");
    expect(capturedHeaders["X-Partner-Key"]).toBeUndefined();
  });

  it("bookShipment falls back to name descriptions for addresses without PostaPlus codes", async () => {
    let capturedBody: any;
    globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ airWaybill: "102300188735" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as any;
    const customerParams = {
      ...params,
      shippingAddress: {
        first_name: "Aisha",
        last_name: "Khan",
        phone: "971501234567",
        address_line_1: "Villa 12, Street 8",
        city: "Dubai",
        state: "Dubai",
        country_code: "AE",
        email: "aisha@example.com",
      },
      shipperAddress: {
        name: "Al Quoz Materials Warehouse",
        phone: "971501234568",
        address_line_1: "Warehouse 3, Al Quoz",
        city: "Dubai",
        emirate: "Dubai",
        country_code: "AE",
      },
      pickupAddress: undefined,
    };
    await adapter.bookShipment(customerParams, creds);
    const consignee = capturedBody.shipmentCommand.consignee;
    expect(consignee.name).toBe("Aisha Khan");
    expect(consignee.cityCode).toBe("");
    expect(consignee.cityDescription).toBe("Dubai");
    expect(consignee.provinceCode).toBe("");
    expect(consignee.provinceDescription).toBe("Dubai");
    expect(consignee.mobile).toBe("971501234567");
    const shipper = capturedBody.shipmentCommand.shipper;
    expect(shipper.cityCode).toBe("");
    expect(shipper.cityDescription).toBe("Dubai");
    expect(shipper.provinceCode).toBe("");
    expect(shipper.provinceDescription).toBe("Dubai");
  });

  it("bookShipment keeps code-shaped province and city values in the code fields", async () => {
    let capturedBody: any;
    globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ airWaybill: "102300188735" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as any;
    const codeParams = {
      ...params,
      shippingAddress: {
        ...params.shippingAddress,
        province_code: undefined,
        city_code: undefined,
        state: "DU",
        city: "CITY415673",
      },
    };
    await adapter.bookShipment(codeParams, creds);
    const consignee = capturedBody.shipmentCommand.consignee;
    expect(consignee.provinceCode).toBe("DU");
    expect(consignee.provinceDescription).toBe("");
    expect(consignee.cityCode).toBe("CITY415673");
    expect(consignee.cityDescription).toBe("");
  });

  it("bookShipment floors actualWeight at the PostaPlus 1 kg minimum", async () => {
    let capturedBody: any;
    globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ airWaybill: "102300188735" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as any;
    await adapter.bookShipment(
      { ...params, items: [{ productName: "Lip balm", quantity: 1, weightGrams: 200 }] },
      creds,
    );
    expect(capturedBody.shipmentCommand.actualWeight).toBe(1);
  });

  it("bookShipment throws when PostaPlus returns an unsuccessful response", async () => {
    globalThis.fetch = mock(
      async () =>
        new Response(JSON.stringify({ isSuccessful: false, message: "Bad area code" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    ) as any;
    await expect(adapter.bookShipment(params, creds)).rejects.toThrow(/Bad area code/);
  });

  it("bookShipment throws on API failure", async () => {
    globalThis.fetch = mock(
      async () => new Response("boom", { status: 500, statusText: "Server Error" }),
    ) as any;
    await expect(adapter.bookShipment(params, creds)).rejects.toThrow(/PostaPlus API error/);
  });

  it("bookShipment retries transient gateway failures and succeeds", async () => {
    let calls = 0;
    const fetchMock = mock(async () => {
      calls++;
      if (calls < 3) return new Response("late", { status: 504, statusText: "Gateway Time-out" });
      return new Response(JSON.stringify({ airWaybill: "102300188735" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    globalThis.fetch = fetchMock as any;
    const retryingAdapter = new PostaPlusAdapter({ retry: { baseDelayMs: 0 } });
    const res = await retryingAdapter.bookShipment(params, creds);
    expect(res.tracking_number).toBe("102300188735");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("bookShipment fails with the API error once retries are exhausted", async () => {
    const fetchMock = mock(
      async () => new Response("late", { status: 504, statusText: "Gateway Time-out" }),
    );
    globalThis.fetch = fetchMock as any;
    const retryingAdapter = new PostaPlusAdapter({ retry: { attempts: 3, baseDelayMs: 0 } });
    await expect(retryingAdapter.bookShipment(params, creds)).rejects.toThrow(
      /PostaPlus API error: 504/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("bookShipment does not retry validation failures or unsuccessful bookings", async () => {
    const badRequest = mock(async () => new Response("bad", { status: 400 }));
    globalThis.fetch = badRequest as any;
    const retryingAdapter = new PostaPlusAdapter({ retry: { baseDelayMs: 0 } });
    await expect(retryingAdapter.bookShipment(params, creds)).rejects.toThrow(
      /PostaPlus API error: 400/,
    );
    expect(badRequest).toHaveBeenCalledTimes(1);

    const unsuccessful = mock(
      async () =>
        new Response(JSON.stringify({ isSuccessful: false, message: "Bad area code" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    globalThis.fetch = unsuccessful as any;
    await expect(retryingAdapter.bookShipment(params, creds)).rejects.toThrow(/Bad area code/);
    expect(unsuccessful).toHaveBeenCalledTimes(1);
  });

  it("verifyCredentials validates required PostaPlus fields without calling an unknown ping endpoint", async () => {
    const r = await adapter.verifyCredentials(creds);
    expect(r.ok).toBe(true);
  });

  it("parseWebhookEvent maps PostaPlus webhook action codes to local shipment statuses", () => {
    const event = adapter.parseWebhookEvent(
      JSON.stringify({
        ShipmentCode: "102300217325",
        ActionCode: "OFD",
        ActionName: "Out for delivery",
        ActionDate: "2025-11-03T18:30:00Z",
        Note1: "driver assigned",
      }),
    );
    expect(event.external_shipment_id).toBe("102300217325");
    expect(event.external_event_id).toBe("102300217325:OFD:2025-11-03T18:30:00Z");
    expect(event.status).toBe(ShipmentStatus.out_for_delivery);
    expect(event.description).toBe("Out for delivery");
  });

  it("parseWebhookEvent treats PU scan as carrier pickup", () => {
    const event = adapter.parseWebhookEvent(
      JSON.stringify({
        ShipmentCode: "102601634142",
        ActionCode: "PU",
        ActionName: "PU scan ",
        ActionDate: "06/15/2026 09:46:59",
      }),
    );

    expect(event.external_shipment_id).toBe("102601634142");
    expect(event.external_event_id).toBe("102601634142:PU:06/15/2026 09:46:59");
    expect(event.status).toBe(ShipmentStatus.in_transit);
    expect(event.description).toBe("PU scan");
  });

  it.each([
    ["Pickup Alert Created", "Pickup Alert Created", ShipmentStatus.pending],
    ["ACT-ASNNGC", "Pick up Assigned to courier", ShipmentStatus.pending],
    ["ACT-GCACP", "Accept", ShipmentStatus.pending],
    ["ACT-PKPRESC", "Reschedule", ShipmentStatus.pending],
    ["PICK_Reschedule", "PICK Reschedule", ShipmentStatus.pending],
    ["PICKDIS", "Pickup Dispatch", ShipmentStatus.in_transit],
    // A single pickup attempt failure is retriable — PostaPlus reschedules and
    // re-dispatches (up to 3 attempts) before giving up. It must stay
    // non-terminal (pending / awaiting re-pickup), not failed_delivery.
    ["PICKFALID", "Pickup Failed", ShipmentStatus.pending],
    // Terminal pickup outcomes: PostaPlus has exhausted its retries.
    ["ACT-PKPCLS", "Shimpent Pick Up Failed", ShipmentStatus.failed_delivery],
    ["Pick Up Failed", "First Mile Pick up Failure", ShipmentStatus.failed_delivery],
    ["ACT-GCFAL", "Pick up completed", ShipmentStatus.in_transit],
    ["SOR", "Shipment Orgin Received", ShipmentStatus.in_transit],
    ["FMA002", "Shipment Received at origin facility", ShipmentStatus.in_transit],
    ["SHP-RWTUP", "Reweight", ShipmentStatus.in_transit],
    ["Reweight", "Reweight", ShipmentStatus.in_transit],
    ["wc", "Shipment With Courier", ShipmentStatus.in_transit],
    ["STSPI", "Send To Service Provider", ShipmentStatus.in_transit],
    ["INTL-SHPT-CLR", "Shipment Cleared", ShipmentStatus.in_transit],
    ["INTL-SHPT-AHF", "Shipment Arrived at Hub Facility", ShipmentStatus.in_transit],
    ["INTL-SHPT-SIB", "Inbound Shpt received", ShipmentStatus.in_transit],
    ["INTL-SHPT-LR", "Shipment Load Received", ShipmentStatus.in_transit],
    ["INTL-SHPT-FA", "Shipment Flight Arrived", ShipmentStatus.in_transit],
    ["LM-0025", "Shipment in Facility", ShipmentStatus.in_transit],
    ["ACKSHT", "ACK Sheet Created", ShipmentStatus.in_transit],
    ["LMW-00DR", "Shipment Received at Destination", ShipmentStatus.in_transit],
    ["LMA-00SIB", "Shipment Received back at facility", ShipmentStatus.in_transit],
    ["INT-MNFST", "Add to Manifest", ShipmentStatus.in_transit],
    ["INT-SOB", "Origin Shipped/In Transit", ShipmentStatus.in_transit],
    ["INTL-SHPT-SL", "Shortly Landed", ShipmentStatus.in_transit],
    ["INTL-SHPT-HAC", "Shipment Held By Customs", ShipmentStatus.in_transit],
    ["INTL-SHPT-DIS", "Shipment Disposed", ShipmentStatus.failed_delivery],
    ["LST-INV", "Shipment Lost", ShipmentStatus.failed_delivery],
    ["DMGD", "Shipment Damaged", ShipmentStatus.failed_delivery],
    ["DISPOSED", "Dispose", ShipmentStatus.failed_delivery],
    ["PROH", "Item Prohibited", ShipmentStatus.failed_delivery],
    ["HD@TRN", "Shipment Held In Transit", ShipmentStatus.in_transit],
    ["OH@ODA", "On Hold for out of delivery Area", ShipmentStatus.in_transit],
    ["Cancel", "Cancel Shipment", ShipmentStatus.cancelled],
    ["INTL-SHPT-OFT", "Onhold out of delivery zone", ShipmentStatus.in_transit],
    ["LMA-0032I", "Update Address", ShipmentStatus.in_transit],
    ["INTL-SHPT-CONF", "Shipment Confisticated by Customs", ShipmentStatus.failed_delivery],
    ["INTL-SHPT-DMG", "Shipment Damaged", ShipmentStatus.failed_delivery],
    ["DELIVERED", "Delivered", ShipmentStatus.delivered],
    ["LMA012-1", "Successfully Delivered", ShipmentStatus.delivered],
    ["LMA012", "Successfully Delivered", ShipmentStatus.delivered],
    ["RTN", "Shipment Returned", ShipmentStatus.returned],
    ["RT", "Shipment is ready to be returned", ShipmentStatus.returned],
    ["ARTN", "Shipment Returned", ShipmentStatus.returned],
    ["RTA005", "Shipment Returned to Shipper", ShipmentStatus.returned],
    ["RT-STKOUT", "Stock Out", ShipmentStatus.returned],
    ["RTA-RTC", "Shipment Returned to Shipper", ShipmentStatus.returned],
    ["DEX", "Delivery Exception", ShipmentStatus.failed_delivery],
    ["DEX-1", "Delivery Exception", ShipmentStatus.failed_delivery],
  ])("maps PostaPlus event code %s to %s", (actionCode, actionName, expectedStatus) => {
    const event = adapter.parseWebhookEvent(
      JSON.stringify({
        ShipmentCode: "102601634142",
        ActionCode: actionCode,
        ActionName: actionName,
        ActionDate: "06/15/2026 09:46:59",
      }),
    );

    expect(event.status).toBe(expectedStatus);
  });

  it("pollTracking fetches shipment tracking and maps the latest action to a webhook event", async () => {
    let capturedUrl = "";
    let capturedBody: any;
    globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedBody = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          workflowActionCode: "FMA002",
          workflowActionName: "SIB",
          actionDate: "3/22/2023 9:06:56 PM",
          currentActionTenantName: "DXB",
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }) as any;

    const event = await adapter.pollTracking("102300193527", creds);

    expect(capturedUrl).toBe("https://devinfolink.postaplus.net/api/Xchanges/GetShipmentTracking");
    expect(capturedBody).toEqual({ Code: "102300193527" });
    expect(event?.external_shipment_id).toBe("102300193527");
    expect(event?.external_event_id).toBe("102300193527:FMA002:3/22/2023 9:06:56 PM");
    expect(event?.status).toBe(ShipmentStatus.in_transit);
    expect(event?.location).toBe("DXB");
    expect(event?.description).toBe("SIB");
  });

  it("cancelShipment calls the PostaPlus cancel shipment endpoint", async () => {
    let capturedUrl = "";
    let capturedBody: any;
    let capturedHeaders: Record<string, string> = {};
    globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedBody = JSON.parse(String(init?.body));
      capturedHeaders = (init?.headers ?? {}) as Record<string, string>;
      return new Response(JSON.stringify({ isSuccessful: true, message: "Created Successfully" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as any;

    await adapter.cancelShipment(
      { trackingNumber: "102601526877", reason: "Customer cancelled order" },
      creds,
    );

    expect(capturedUrl).toBe("https://devinfolink.postaplus.net/api/Xchanges/CancelShipment");
    expect(capturedHeaders.PartnerKey).toBe("partner-1");
    expect(capturedHeaders.WaitResponse).toBe("0");
    expect(capturedBody).toEqual({
      shipmentCodes: ["102601526877"],
      actioncode: "cancel",
      notes: "Customer cancelled order",
    });
  });

  it("cancelPickup calls the PostaPlus cancel pickup endpoint", async () => {
    let capturedUrl = "";
    let capturedBody: any;
    globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify(1), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as any;

    await adapter.cancelPickup({ pickupCode: "PU230402791" }, creds);

    expect(capturedUrl).toBe("https://devinfolink.postaplus.net/api/Xchanges/CancelPickup");
    expect(capturedBody).toEqual({ code: "PU230402791", tenant: "DXB" });
  });

  it("amendCodAmount posts the reduced COD amount to UpdateShipment", async () => {
    let capturedUrl = "";
    let capturedBody: any;
    let capturedHeaders: Record<string, string> = {};
    globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedBody = JSON.parse(String(init?.body));
      capturedHeaders = (init?.headers ?? {}) as Record<string, string>;
      return new Response(JSON.stringify({ isSuccessful: true, message: "Updated Successfully" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as any;

    await adapter.amendCodAmount(
      {
        airWaybill: "102601527064",
        codAmountFils: 8134,
        shipperAddress: params.shipperAddress,
        shippingAddress: params.shippingAddress,
        items: params.items,
      },
      creds,
    );

    expect(capturedUrl).toBe("https://devinfolink.postaplus.net/api/Xchanges/UpdateShipment");
    expect(capturedHeaders.PartnerKey).toBe("partner-1");
    expect(capturedBody.airWaybill).toBe("102601527064");
    expect(capturedBody.codAmount).toBe(81.34);
    expect(capturedBody.isCod).toBe(true);
    expect(capturedBody.actualWeight).toBe(1.3);
    expect(capturedBody.shipper.shipperName).toBe("Shipper Name");
    expect(capturedBody.consignee.name).toBe("Consignee Name UAE");
    expect(capturedBody.performaInvoices).toEqual([]);
  });

  it("amendCodAmount zeroes out COD and isCod when codAmountFils is 0", async () => {
    let capturedBody: any;
    globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ isSuccessful: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as any;

    await adapter.amendCodAmount(
      {
        airWaybill: "102601527064",
        codAmountFils: 0,
        shipperAddress: params.shipperAddress,
        shippingAddress: params.shippingAddress,
        items: params.items,
      },
      creds,
    );

    expect(capturedBody.codAmount).toBe(0);
    expect(capturedBody.isCod).toBe(false);
  });

  it("amendCodAmount throws on API failure", async () => {
    globalThis.fetch = mock(
      async () => new Response("boom", { status: 500, statusText: "Server Error" }),
    ) as any;
    await expect(
      adapter.amendCodAmount(
        {
          airWaybill: "102601527064",
          codAmountFils: 8134,
          shipperAddress: params.shipperAddress,
          shippingAddress: params.shippingAddress,
          items: params.items,
        },
        creds,
      ),
    ).rejects.toThrow(/PostaPlus API error/);
  });

  it("amendCodAmount throws when PostaPlus reports isSuccessful: false", async () => {
    globalThis.fetch = mock(
      async () =>
        new Response(JSON.stringify({ isSuccessful: false, message: "AWB not found" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    ) as any;
    await expect(
      adapter.amendCodAmount(
        {
          airWaybill: "102601527064",
          codAmountFils: 8134,
          shipperAddress: params.shipperAddress,
          shippingAddress: params.shippingAddress,
          items: params.items,
        },
        creds,
      ),
    ).rejects.toThrow(/AWB not found/);
  });

  it("appends item externalId to the shipment description", async () => {
    let capturedBody: any;
    globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ airWaybill: "AWB1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as any;

    await adapter.bookShipment(
      {
        ...params,
        items: [
          { productName: "Serum", quantity: 1, weightGrams: 500, externalId: "V-1001" },
          { productName: "Cream", quantity: 1, weightGrams: 500, externalId: null },
        ],
      },
      creds,
    );

    expect(capturedBody.shipmentCommand.description).toBe("Serum (V-1001), Cream");
  });
});
