import { beforeEach, describe, expect, it, mock } from "bun:test";
import { OrderStatus, ShipmentStatus } from "@materialhub/database/src/enums/order.enums.ts";
import { ShipmentTrackingService } from "./shipment-tracking.service.ts";

const ADMIN_USER_ID = "0b8f5c1e-3a8e-4f63-9a51-6d9d2b0c7a11";
const MEMBER_USER_ID = "5d2c7a90-1b4e-4c8a-8f3d-2e6b9a0c4d22";

describe("ShipmentTrackingService", () => {
  const mockShipmentQueryBuilder: any = {
    innerJoin: mock(() => mockShipmentQueryBuilder),
    where: mock(() => mockShipmentQueryBuilder),
    getMany: mock(() => Promise.resolve([])),
  };

  const mockShipmentRepo = {
    findOne: mock((_args?: any): Promise<any> => Promise.resolve(null)),
    create: mock((data: any) => ({ id: "shipment-1", ...data })),
    save: mock((entity: any) => Promise.resolve(entity)),
  };

  const mockShipmentItemRepo = {
    createQueryBuilder: mock(() => mockShipmentQueryBuilder),
    create: mock((data: any) => data),
    save: mock((entity: any) => Promise.resolve(entity)),
  };

  const mockShipmentEventRepo = {
    query: mock(() => Promise.resolve({ rowCount: 1 })),
    find: mock((_args?: any): Promise<any> => Promise.resolve([])),
  };

  const mockVendorOrderRepo = {
    findOne: mock((_args?: any): Promise<any> => Promise.resolve(null)),
  };

  const mockOrderItemRepo = {
    save: mock((entity: any) => Promise.resolve(entity)),
  };

  const mockOrderStatusService = {
    transitionVendorOrder: mock(() => Promise.resolve({})),
  };

  const mockShipmentStatusHistoryRepo = {
    create: mock((data: any) => ({ id: "history-1", ...data })),
    save: mock((entity: any) => Promise.resolve(entity)),
  };

  let service: ShipmentTrackingService;

  beforeEach(() => {
    // Clear all mocks
    mockShipmentRepo.findOne.mockClear();
    mockShipmentRepo.create.mockClear();
    mockShipmentRepo.save.mockClear();
    mockShipmentItemRepo.createQueryBuilder.mockClear();
    mockShipmentItemRepo.create.mockClear();
    mockShipmentItemRepo.save.mockClear();
    mockShipmentEventRepo.query.mockClear();
    mockShipmentEventRepo.find.mockClear();
    mockShipmentEventRepo.find.mockImplementation(() => Promise.resolve([]));
    mockVendorOrderRepo.findOne.mockClear();
    mockOrderItemRepo.save.mockClear();
    mockOrderStatusService.transitionVendorOrder.mockClear();
    mockShipmentStatusHistoryRepo.create.mockClear();
    mockShipmentStatusHistoryRepo.save.mockClear();
    mockShipmentStatusHistoryRepo.create.mockImplementation((data: any) => ({
      id: "history-1",
      ...data,
    }));

    // Reset query builder mocks and restore chaining
    mockShipmentQueryBuilder.innerJoin.mockClear();
    mockShipmentQueryBuilder.where.mockClear();
    mockShipmentQueryBuilder.getMany.mockClear();
    mockShipmentQueryBuilder.innerJoin.mockImplementation(() => mockShipmentQueryBuilder);
    mockShipmentQueryBuilder.where.mockImplementation(() => mockShipmentQueryBuilder);
    mockShipmentQueryBuilder.getMany.mockResolvedValue([]);

    // Reset create mock
    mockShipmentRepo.create.mockImplementation((data: any) => ({ id: "shipment-1", ...data }));

    service = new ShipmentTrackingService(
      mockShipmentRepo as any,
      mockShipmentItemRepo as any,
      mockShipmentEventRepo as any,
      mockVendorOrderRepo as any,
      mockOrderItemRepo as any,
      mockOrderStatusService as any,
      mockShipmentStatusHistoryRepo as any,
    );
  });

  describe("createShipment", () => {
    it("throws if vendor_order not found", async () => {
      mockVendorOrderRepo.findOne.mockResolvedValueOnce(null);

      await expect(
        service.createShipment("vo-1", "vendor-1", {
          tracking_number: "TRK-123",
          carrier: "aramex",
          items: [{ order_item_id: "oi-1", quantity: 1 }],
        }),
      ).rejects.toThrow("Vendor order not found");
    });

    it("throws if vendor doesn't own it", async () => {
      mockVendorOrderRepo.findOne.mockResolvedValueOnce({
        id: "vo-1",
        vendor_id: "other-vendor",
        order_id: "order-1",
        status: OrderStatus.processing,
        items: [{ id: "oi-1", quantity: 2 }],
      });

      await expect(
        service.createShipment("vo-1", "vendor-1", {
          tracking_number: "TRK-123",
          carrier: "aramex",
          items: [{ order_item_id: "oi-1", quantity: 1 }],
        }),
      ).rejects.toThrow("Vendor order not found");
    });

    it("throws if status not shippable", async () => {
      mockVendorOrderRepo.findOne.mockResolvedValueOnce({
        id: "vo-1",
        vendor_id: "vendor-1",
        order_id: "order-1",
        status: OrderStatus.delivered,
        items: [{ id: "oi-1", quantity: 2 }],
      });

      await expect(
        service.createShipment("vo-1", "vendor-1", {
          tracking_number: "TRK-123",
          carrier: "aramex",
          items: [{ order_item_id: "oi-1", quantity: 1 }],
        }),
      ).rejects.toThrow("Vendor order is not in a shippable status");
    });

    it("ships every unshipped unit when items are omitted (dashboard Create Shipment)", async () => {
      mockVendorOrderRepo.findOne.mockResolvedValueOnce({
        id: "vo-1",
        vendor_id: "vendor-1",
        order_id: "order-1",
        status: OrderStatus.processing,
        items: [
          { id: "oi-1", quantity: 5, status: OrderStatus.processing },
          { id: "oi-2", quantity: 2, status: OrderStatus.processing },
          { id: "oi-3", quantity: 4, status: OrderStatus.cancelled },
        ],
      });
      // 2 of oi-1 and all of oi-2 already went out in an earlier shipment.
      mockShipmentQueryBuilder.getMany.mockResolvedValueOnce([
        { order_item_id: "oi-1", quantity: 2 },
        { order_item_id: "oi-2", quantity: 2 },
      ]);

      await service.createShipment(
        "vo-1",
        "vendor-1",
        { tracking_number: "TRK-9", carrier: "aramex" },
        MEMBER_USER_ID,
      );

      const created = mockShipmentItemRepo.create.mock.calls.map((c: any) => c[0]);
      expect(created).toEqual([{ shipment_id: "shipment-1", order_item_id: "oi-1", quantity: 3 }]);
      // The member's user id is the history actor; the vendor id is ownership.
      expect(mockOrderStatusService.transitionVendorOrder).toHaveBeenCalledWith(
        "vo-1",
        OrderStatus.shipped,
        { userId: MEMBER_USER_ID, vendorId: "vendor-1", role: "vendor" },
        "Shipment created",
      );
    });

    it("refuses when items are omitted and nothing is left to ship", async () => {
      mockVendorOrderRepo.findOne.mockResolvedValueOnce({
        id: "vo-1",
        vendor_id: "vendor-1",
        order_id: "order-1",
        status: OrderStatus.shipped,
        items: [{ id: "oi-1", quantity: 1 }],
      });
      mockShipmentQueryBuilder.getMany.mockResolvedValueOnce([
        { order_item_id: "oi-1", quantity: 1 },
      ]);

      await expect(
        service.createShipment("vo-1", "vendor-1", { tracking_number: "T", carrier: "aramex" }),
      ).rejects.toMatchObject({ statusCode: 409, code: "NOTHING_TO_SHIP" });
    });

    it("rejects a line that is not on this vendor order", async () => {
      mockVendorOrderRepo.findOne.mockResolvedValueOnce({
        id: "vo-1",
        vendor_id: "vendor-1",
        order_id: "order-1",
        status: OrderStatus.processing,
        items: [{ id: "oi-1", quantity: 1 }],
      });
      await expect(
        service.createShipment("vo-1", "vendor-1", {
          tracking_number: "T",
          carrier: "aramex",
          items: [{ order_item_id: "oi-other", quantity: 1 }],
        }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("accepts a confirmed order on the way to shipped", async () => {
      mockVendorOrderRepo.findOne.mockResolvedValueOnce({
        id: "vo-1",
        vendor_id: "vendor-1",
        order_id: "order-1",
        status: OrderStatus.confirmed,
        items: [{ id: "oi-1", quantity: 1 }],
      });

      await service.createShipment("vo-1", "vendor-1", { tracking_number: "T", carrier: "x" });

      const targets = mockOrderStatusService.transitionVendorOrder.mock.calls.map((c: any) => c[1]);
      expect(targets).toEqual([
        OrderStatus.processing,
        OrderStatus.ready_to_ship,
        OrderStatus.shipped,
      ]);
    });

    it("throws if shipped qty exceeds ordered qty", async () => {
      mockVendorOrderRepo.findOne.mockResolvedValueOnce({
        id: "vo-1",
        vendor_id: "vendor-1",
        order_id: "order-1",
        status: OrderStatus.processing,
        items: [{ id: "oi-1", quantity: 2 }],
      });

      // Simulate existing shipment items already shipped 2 of oi-1
      mockShipmentQueryBuilder.getMany.mockResolvedValueOnce([
        { order_item_id: "oi-1", quantity: 2 },
      ]);

      await expect(
        service.createShipment("vo-1", "vendor-1", {
          tracking_number: "TRK-123",
          carrier: "aramex",
          items: [{ order_item_id: "oi-1", quantity: 1 }],
        }),
      ).rejects.toThrow("Shipped quantity exceeds ordered quantity");
    });

    it("creates shipment and transitions processing to shipped", async () => {
      mockVendorOrderRepo.findOne.mockResolvedValueOnce({
        id: "vo-1",
        vendor_id: "vendor-1",
        order_id: "order-1",
        status: OrderStatus.processing,
        items: [{ id: "oi-1", quantity: 5 }],
      });
      mockShipmentQueryBuilder.getMany.mockResolvedValueOnce([]);

      const _result = await service.createShipment("vo-1", "vendor-1", {
        tracking_number: "TRK-123",
        carrier: "aramex",
        items: [{ order_item_id: "oi-1", quantity: 3 }],
      });

      expect(mockShipmentRepo.create).toHaveBeenCalledTimes(1);
      expect(mockShipmentRepo.save).toHaveBeenCalledTimes(1);
      expect(mockShipmentItemRepo.create).toHaveBeenCalledTimes(1);
      expect(mockShipmentItemRepo.save).toHaveBeenCalledTimes(1);
      // processing -> ready_to_ship -> shipped (two transitions)
      expect(mockOrderStatusService.transitionVendorOrder).toHaveBeenCalledTimes(2);
      expect(mockOrderStatusService.transitionVendorOrder).toHaveBeenCalledWith(
        "vo-1",
        OrderStatus.ready_to_ship,
        { userId: null, vendorId: "vendor-1", role: "vendor" },
        "Shipment created",
      );
      expect(mockOrderStatusService.transitionVendorOrder).toHaveBeenCalledWith(
        "vo-1",
        OrderStatus.shipped,
        { userId: null, vendorId: "vendor-1", role: "vendor" },
        "Shipment created",
      );
    });

    it("resolves shipment warehouse_id: explicit > vendor_order > vendor default", async () => {
      const base = {
        id: "vo-1",
        vendor_id: "vendor-1",
        order_id: "order-1",
        status: OrderStatus.processing,
        items: [{ id: "oi-1", quantity: 5 }],
      };
      const items = [{ order_item_id: "oi-1", quantity: 1 }];

      // 1. Explicit warehouse_id wins.
      mockVendorOrderRepo.findOne.mockResolvedValueOnce({ ...base, warehouse_id: "wh-order" });
      mockShipmentQueryBuilder.getMany.mockResolvedValueOnce([]);
      await service.createShipment("vo-1", "vendor-1", {
        tracking_number: "T1",
        carrier: "aramex",
        warehouse_id: "wh-explicit",
        items,
      });
      expect(mockShipmentRepo.create.mock.calls.at(-1)![0].warehouse_id).toBe("wh-explicit");

      // 2. No explicit → falls back to the vendor_order's stamped warehouse.
      mockVendorOrderRepo.findOne.mockResolvedValueOnce({ ...base, warehouse_id: "wh-order" });
      mockShipmentQueryBuilder.getMany.mockResolvedValueOnce([]);
      await service.createShipment("vo-1", "vendor-1", {
        tracking_number: "T2",
        carrier: "aramex",
        items,
      });
      expect(mockShipmentRepo.create.mock.calls.at(-1)![0].warehouse_id).toBe("wh-order");

      // 3. Neither → falls back to the vendor's default warehouse via repo.
      const svcWithWh = new ShipmentTrackingService(
        mockShipmentRepo as any,
        mockShipmentItemRepo as any,
        mockShipmentEventRepo as any,
        mockVendorOrderRepo as any,
        mockOrderItemRepo as any,
        mockOrderStatusService as any,
        mockShipmentStatusHistoryRepo as any,
        undefined,
        undefined,
        { findOne: mock(() => Promise.resolve({ id: "wh-default" })) } as any,
      );
      mockVendorOrderRepo.findOne.mockResolvedValueOnce({ ...base, warehouse_id: null });
      mockShipmentQueryBuilder.getMany.mockResolvedValueOnce([]);
      await svcWithWh.createShipment("vo-1", "vendor-1", {
        tracking_number: "T3",
        carrier: "aramex",
        items,
      });
      expect(mockShipmentRepo.create.mock.calls.at(-1)![0].warehouse_id).toBe("wh-default");
    });

    it("rejects an explicit warehouse without owner or share permission", async () => {
      const svcWithWh = new ShipmentTrackingService(
        mockShipmentRepo as any,
        mockShipmentItemRepo as any,
        mockShipmentEventRepo as any,
        mockVendorOrderRepo as any,
        mockOrderItemRepo as any,
        mockOrderStatusService as any,
        mockShipmentStatusHistoryRepo as any,
        undefined,
        undefined,
        {
          findOne: mock(() =>
            Promise.resolve({ id: "wh-other", vendor_id: "vendor-2", is_active: true }),
          ),
        } as any,
        { findOne: mock(() => Promise.resolve(null)) } as any,
      );

      mockVendorOrderRepo.findOne.mockResolvedValueOnce({
        id: "vo-1",
        vendor_id: "vendor-1",
        order_id: "order-1",
        status: OrderStatus.processing,
        items: [{ id: "oi-1", quantity: 5 }],
      });
      mockShipmentQueryBuilder.getMany.mockResolvedValueOnce([]);

      await expect(
        svcWithWh.createShipment("vo-1", "vendor-1", {
          tracking_number: "T4",
          carrier: "aramex",
          warehouse_id: "wh-other",
          items: [{ order_item_id: "oi-1", quantity: 1 }],
        }),
      ).rejects.toThrow("Warehouse not available for this vendor");
      expect(mockShipmentRepo.create).not.toHaveBeenCalled();
    });

    it("allows an explicit shared warehouse with fulfillment permission", async () => {
      const svcWithWh = new ShipmentTrackingService(
        mockShipmentRepo as any,
        mockShipmentItemRepo as any,
        mockShipmentEventRepo as any,
        mockVendorOrderRepo as any,
        mockOrderItemRepo as any,
        mockOrderStatusService as any,
        mockShipmentStatusHistoryRepo as any,
        undefined,
        undefined,
        {
          findOne: mock(() =>
            Promise.resolve({ id: "wh-shared", vendor_id: "vendor-2", is_active: true }),
          ),
        } as any,
        { findOne: mock(() => Promise.resolve({ id: "grant-1" })) } as any,
      );

      mockVendorOrderRepo.findOne.mockResolvedValueOnce({
        id: "vo-1",
        vendor_id: "vendor-1",
        order_id: "order-1",
        status: OrderStatus.processing,
        items: [{ id: "oi-1", quantity: 5 }],
      });
      mockShipmentQueryBuilder.getMany.mockResolvedValueOnce([]);

      await svcWithWh.createShipment("vo-1", "vendor-1", {
        tracking_number: "T5",
        carrier: "aramex",
        warehouse_id: "wh-shared",
        items: [{ order_item_id: "oi-1", quantity: 1 }],
      });

      expect(mockShipmentRepo.create.mock.calls.at(-1)![0].warehouse_id).toBe("wh-shared");
    });

    it("creates shipment and transitions ready_to_ship to shipped", async () => {
      mockVendorOrderRepo.findOne.mockResolvedValueOnce({
        id: "vo-1",
        vendor_id: "vendor-1",
        order_id: "order-1",
        status: OrderStatus.ready_to_ship,
        items: [{ id: "oi-1", quantity: 5 }],
      });
      mockShipmentQueryBuilder.getMany.mockResolvedValueOnce([]);

      await service.createShipment("vo-1", "vendor-1", {
        tracking_number: "TRK-123",
        carrier: "aramex",
        items: [{ order_item_id: "oi-1", quantity: 3 }],
      });

      // ready_to_ship -> shipped (one transition)
      expect(mockOrderStatusService.transitionVendorOrder).toHaveBeenCalledTimes(1);
      expect(mockOrderStatusService.transitionVendorOrder).toHaveBeenCalledWith(
        "vo-1",
        OrderStatus.shipped,
        { userId: null, vendorId: "vendor-1", role: "vendor" },
        "Shipment created",
      );
    });

    it("creates an auto-booked carrier shipment without marking the order shipped", async () => {
      mockVendorOrderRepo.findOne.mockResolvedValueOnce({
        id: "vo-1",
        vendor_id: "vendor-1",
        order_id: "order-1",
        status: OrderStatus.ready_to_ship,
        items: [{ id: "oi-1", quantity: 5 }],
      });
      mockShipmentQueryBuilder.getMany.mockResolvedValueOnce([]);

      await service.createShipment("vo-1", "vendor-1", {
        tracking_number: "POSTA-AWB-1",
        carrier: "postaplus",
        auto_booked: true,
        items: [{ order_item_id: "oi-1", quantity: 3 }],
      });

      expect(mockShipmentRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: ShipmentStatus.pending,
          shipped_at: null,
        }),
      );
      expect(mockOrderStatusService.transitionVendorOrder).not.toHaveBeenCalled();
    });

    it("creates shipment with no transition if already shipped (split shipment)", async () => {
      mockVendorOrderRepo.findOne.mockResolvedValueOnce({
        id: "vo-1",
        vendor_id: "vendor-1",
        order_id: "order-1",
        status: OrderStatus.shipped,
        items: [{ id: "oi-1", quantity: 5 }],
      });
      mockShipmentQueryBuilder.getMany.mockResolvedValueOnce([
        { order_item_id: "oi-1", quantity: 2 },
      ]);

      await service.createShipment("vo-1", "vendor-1", {
        tracking_number: "TRK-456",
        carrier: "aramex",
        items: [{ order_item_id: "oi-1", quantity: 2 }],
      });

      expect(mockOrderStatusService.transitionVendorOrder).not.toHaveBeenCalled();
    });
  });

  describe("processWebhookEvent", () => {
    it("returns silently if shipment not found", async () => {
      mockShipmentRepo.findOne.mockResolvedValueOnce(null);

      const result = await service.processWebhookEvent({
        tracking_number: "TRK-MISSING",
        status: ShipmentStatus.in_transit,
        occurred_at: new Date().toISOString(),
      });

      expect(result).toBeUndefined();
      expect(mockShipmentEventRepo.query).not.toHaveBeenCalled();
    });

    it("rejects backward status progression", async () => {
      mockShipmentRepo.findOne.mockResolvedValueOnce({
        id: "shipment-1",
        status: ShipmentStatus.out_for_delivery,
        vendor_order_id: "vo-1",
        items: [],
      });

      await expect(
        service.processWebhookEvent({
          tracking_number: "TRK-123",
          status: ShipmentStatus.in_transit,
          occurred_at: new Date().toISOString(),
        }),
      ).rejects.toThrow("Invalid status progression");
    });

    it("rejects terminal status after delivered", async () => {
      mockShipmentRepo.findOne.mockResolvedValueOnce({
        id: "shipment-1",
        status: ShipmentStatus.delivered,
        vendor_order_id: "vo-1",
        items: [],
      });

      await expect(
        service.processWebhookEvent({
          tracking_number: "TRK-123",
          status: ShipmentStatus.returned,
          occurred_at: new Date().toISOString(),
        }),
      ).rejects.toThrow("Invalid status progression");
    });

    it("updates shipment status and marks items delivered on delivered event", async () => {
      const mockItems = [
        { id: "si-1", is_delivered: false, delivered_at: null },
        { id: "si-2", is_delivered: false, delivered_at: null },
      ];
      mockShipmentRepo.findOne.mockResolvedValueOnce({
        id: "shipment-1",
        status: ShipmentStatus.in_transit,
        vendor_order_id: "vo-1",
        items: mockItems,
      });
      mockShipmentEventRepo.query.mockResolvedValueOnce({ rowCount: 1 });

      await service.processWebhookEvent({
        tracking_number: "TRK-123",
        status: ShipmentStatus.delivered,
        occurred_at: new Date().toISOString(),
      });

      expect(mockShipmentRepo.save).toHaveBeenCalled();
      const savedShipment = mockShipmentRepo.save.mock.calls[0]![0] as any;
      expect(savedShipment.status).toBe(ShipmentStatus.delivered);
      expect(savedShipment.delivered_at).toBeDefined();
      // Items should be marked delivered — these are ShipmentItem rows, so they
      // must be persisted through the shipment-item repo (order_items has a
      // NOT NULL order_id these rows don't carry).
      expect(mockShipmentItemRepo.save).toHaveBeenCalled();
      expect(mockOrderItemRepo.save).not.toHaveBeenCalled();
      // Should trigger delivered transition
      expect(mockOrderStatusService.transitionVendorOrder).toHaveBeenCalledWith(
        "vo-1",
        OrderStatus.delivered,
        { userId: null, role: "system" },
        "Shipment delivered",
        undefined,
      );
    });

    it("skips duplicate events (rowCount 0)", async () => {
      mockShipmentRepo.findOne.mockResolvedValueOnce({
        id: "shipment-1",
        status: ShipmentStatus.in_transit,
        vendor_order_id: "vo-1",
        items: [],
      });
      mockShipmentEventRepo.query.mockResolvedValueOnce({ rowCount: 0 });

      await service.processWebhookEvent({
        tracking_number: "TRK-123",
        status: ShipmentStatus.out_for_delivery,
        occurred_at: new Date().toISOString(),
      });

      // Should not update shipment since it's a duplicate
      expect(mockShipmentRepo.save).not.toHaveBeenCalled();
    });

    it("skips duplicate external carrier events before status progression validation", async () => {
      mockShipmentRepo.findOne.mockResolvedValueOnce({
        id: "shipment-1",
        status: ShipmentStatus.in_transit,
        vendor_order_id: "vo-1",
        items: [],
      });
      mockShipmentEventRepo.query.mockResolvedValueOnce({ rowCount: 0 });

      await expect(
        service.processWebhookEvent({
          tracking_number: "TRK-123",
          provider_id: "provider-1",
          external_event_id: "event-1",
          status: ShipmentStatus.in_transit,
          occurred_at: "2026-06-11T18:15:00Z",
        }),
      ).resolves.toBeUndefined();

      expect(mockShipmentRepo.save).not.toHaveBeenCalled();
    });

    it("records external carrier events without failing when they do not advance status", async () => {
      mockShipmentRepo.findOne.mockResolvedValueOnce({
        id: "shipment-1",
        status: ShipmentStatus.in_transit,
        vendor_order_id: "vo-1",
        items: [],
      });
      mockShipmentEventRepo.query.mockResolvedValueOnce({ rowCount: 1 });

      await expect(
        service.processWebhookEvent({
          tracking_number: "TRK-123",
          provider_id: "provider-1",
          external_event_id: "event-pu-scan",
          status: ShipmentStatus.in_transit,
          occurred_at: "2026-06-15T09:46:59Z",
          description: "PU scan",
        }),
      ).resolves.toBeUndefined();

      expect(mockShipmentEventRepo.query).toHaveBeenCalled();
      expect(mockShipmentRepo.save).not.toHaveBeenCalled();
      expect(mockShipmentStatusHistoryRepo.save).not.toHaveBeenCalled();
    });

    it("triggers out_for_delivery transition on vendor order", async () => {
      mockShipmentRepo.findOne.mockResolvedValueOnce({
        id: "shipment-1",
        status: ShipmentStatus.in_transit,
        vendor_order_id: "vo-1",
        items: [],
      });
      mockShipmentEventRepo.query.mockResolvedValueOnce({ rowCount: 1 });

      await service.processWebhookEvent({
        tracking_number: "TRK-123",
        status: ShipmentStatus.out_for_delivery,
        occurred_at: new Date().toISOString(),
      });

      expect(mockOrderStatusService.transitionVendorOrder).toHaveBeenCalledWith(
        "vo-1",
        OrderStatus.out_for_delivery,
        { userId: null, role: "system" },
        "Shipment out for delivery",
        undefined,
      );
    });

    it("marks vendor order shipped when carrier confirms pickup", async () => {
      mockShipmentRepo.findOne.mockResolvedValueOnce({
        id: "shipment-1",
        status: ShipmentStatus.pending,
        vendor_order_id: "vo-1",
        items: [],
        shipped_at: null,
      });
      mockShipmentEventRepo.query.mockResolvedValueOnce({ rowCount: 1 });

      await service.processWebhookEvent({
        tracking_number: "TRK-123",
        status: ShipmentStatus.in_transit,
        occurred_at: "2026-06-11T18:15:00Z",
        description: "SIB",
      });

      const savedShipment = mockShipmentRepo.save.mock.calls[0]![0] as any;
      expect(savedShipment.status).toBe(ShipmentStatus.in_transit);
      expect(savedShipment.shipped_at).toBeDefined();
      expect(mockOrderStatusService.transitionVendorOrder).toHaveBeenCalledWith(
        "vo-1",
        OrderStatus.shipped,
        { userId: null, role: "system" },
        "Shipment picked up by carrier",
        undefined,
      );
    });
  });

  describe("transitionShipmentStatus", () => {
    it("throws if shipment not found", async () => {
      mockShipmentRepo.findOne.mockResolvedValueOnce(null);

      await expect(
        service.transitionShipmentStatus(
          "shipment-1",
          {
            userId: "vendor-1",
            role: "vendor" as const,
          },
          ShipmentStatus.picked_up,
          "Picked up from warehouse",
        ),
      ).rejects.toThrow("Shipment not found");
    });

    it("throws if vendor does not own shipment", async () => {
      mockShipmentRepo.findOne.mockResolvedValueOnce({
        id: "shipment-1",
        vendor_id: "other-vendor",
        vendor_order_id: "vo-1",
        status: ShipmentStatus.pending,
        items: [],
      });

      await expect(
        service.transitionShipmentStatus(
          "shipment-1",
          {
            userId: "vendor-1",
            role: "vendor" as const,
          },
          ShipmentStatus.picked_up,
          "Picked up from warehouse",
        ),
      ).rejects.toThrow("Shipment not found");
    });

    it("allows admin to transition any shipment", async () => {
      mockShipmentRepo.findOne.mockResolvedValueOnce({
        id: "shipment-1",
        vendor_id: "some-vendor",
        vendor_order_id: "vo-1",
        status: ShipmentStatus.pending,
        items: [],
      });

      await service.transitionShipmentStatus(
        "shipment-1",
        {
          userId: "admin-1",
          role: "admin" as const,
        },
        ShipmentStatus.picked_up,
        "Admin override",
      );

      expect(mockShipmentRepo.save).toHaveBeenCalled();
      expect(mockShipmentStatusHistoryRepo.save).toHaveBeenCalled();
    });

    it("throws on backward status progression", async () => {
      mockShipmentRepo.findOne.mockResolvedValueOnce({
        id: "shipment-1",
        vendor_id: "vendor-1",
        vendor_order_id: "vo-1",
        status: ShipmentStatus.in_transit,
        items: [],
      });

      await expect(
        service.transitionShipmentStatus(
          "shipment-1",
          {
            userId: "vendor-1",
            role: "vendor" as const,
          },
          ShipmentStatus.picked_up,
          "Going back",
        ),
      ).rejects.toThrow("Invalid status progression");
    });

    it("throws if vendor tries to set returned", async () => {
      mockShipmentRepo.findOne.mockResolvedValueOnce({
        id: "shipment-1",
        vendor_id: "vendor-1",
        vendor_order_id: "vo-1",
        status: ShipmentStatus.failed_delivery,
        items: [],
      });

      await expect(
        service.transitionShipmentStatus(
          "shipment-1",
          {
            userId: "vendor-1",
            role: "vendor" as const,
          },
          ShipmentStatus.returned,
          "Return it",
        ),
      ).rejects.toThrow("Role vendor cannot transition to returned");
    });

    it("allows admin to set returned from failed_delivery", async () => {
      mockShipmentRepo.findOne.mockResolvedValueOnce({
        id: "shipment-1",
        vendor_id: "vendor-1",
        vendor_order_id: "vo-1",
        status: ShipmentStatus.failed_delivery,
        items: [],
      });

      await service.transitionShipmentStatus(
        "shipment-1",
        {
          userId: "admin-1",
          role: "admin" as const,
        },
        ShipmentStatus.returned,
        "Returned to sender",
      );

      expect(mockShipmentRepo.save).toHaveBeenCalled();
      const saved = mockShipmentRepo.save.mock.calls[0]![0] as any;
      expect(saved.status).toBe(ShipmentStatus.returned);
    });

    it("allows admin to cancel a pending shipment", async () => {
      mockShipmentRepo.findOne.mockResolvedValueOnce({
        id: "shipment-1",
        vendor_id: "vendor-1",
        vendor_order_id: "vo-1",
        status: ShipmentStatus.pending,
        items: [],
      });

      await service.transitionShipmentStatus(
        "shipment-1",
        {
          userId: ADMIN_USER_ID,
          role: "admin" as const,
        },
        ShipmentStatus.cancelled,
        "Order cancelled by admin",
        { carrier_cancelled: true, pickup_cancelled: true },
      );

      const saved = mockShipmentRepo.save.mock.calls[0]![0] as any;
      expect(saved.status).toBe(ShipmentStatus.cancelled);
      expect(mockShipmentStatusHistoryRepo.create).toHaveBeenCalledWith({
        shipment_id: "shipment-1",
        vendor_order_id: "vo-1",
        from_status: ShipmentStatus.pending,
        to_status: ShipmentStatus.cancelled,
        changed_by: ADMIN_USER_ID,
        changed_by_role: "admin",
        is_customer_visible: true,
        reason: "Order cancelled by admin",
        metadata: { carrier_cancelled: true, pickup_cancelled: true },
      });
    });

    it("does not allow vendor users to cancel a shipment", async () => {
      mockShipmentRepo.findOne.mockResolvedValueOnce({
        id: "shipment-1",
        vendor_id: "vendor-1",
        vendor_order_id: "vo-1",
        status: ShipmentStatus.pending,
        items: [],
      });

      await expect(
        service.transitionShipmentStatus(
          "shipment-1",
          {
            userId: "vendor-1",
            role: "vendor" as const,
          },
          ShipmentStatus.cancelled,
          "Vendor cancellation attempt",
        ),
      ).rejects.toThrow("Role vendor cannot transition to cancelled");
    });

    it("vendor transitions pending to picked_up with history", async () => {
      mockShipmentRepo.findOne.mockResolvedValueOnce({
        id: "shipment-1",
        vendor_id: "vendor-1",
        vendor_order_id: "vo-1",
        status: ShipmentStatus.pending,
        items: [],
      });

      await service.transitionShipmentStatus(
        "shipment-1",
        // The acting member's USER id; the vendor it acts for in vendorId.
        {
          userId: MEMBER_USER_ID,
          vendorId: "vendor-1",
          role: "vendor" as const,
        },
        ShipmentStatus.picked_up,
        "Picked up from warehouse",
      );

      expect(mockShipmentRepo.save).toHaveBeenCalled();
      const saved = mockShipmentRepo.save.mock.calls[0]![0] as any;
      expect(saved.status).toBe(ShipmentStatus.picked_up);

      expect(mockShipmentStatusHistoryRepo.create).toHaveBeenCalledWith({
        shipment_id: "shipment-1",
        vendor_order_id: "vo-1",
        from_status: ShipmentStatus.pending,
        to_status: ShipmentStatus.picked_up,
        changed_by: MEMBER_USER_ID,
        changed_by_role: "vendor",
        is_customer_visible: false,
        reason: "Picked up from warehouse",
        metadata: undefined,
      });
      expect(mockShipmentStatusHistoryRepo.save).toHaveBeenCalled();
    });

    it("marks items delivered and triggers order transition on delivered", async () => {
      const mockItems = [{ id: "si-1", is_delivered: false, delivered_at: null }];
      mockShipmentRepo.findOne.mockResolvedValueOnce({
        id: "shipment-1",
        vendor_id: "vendor-1",
        vendor_order_id: "vo-1",
        status: ShipmentStatus.out_for_delivery,
        items: mockItems,
      });

      await service.transitionShipmentStatus(
        "shipment-1",
        {
          userId: "vendor-1",
          role: "vendor" as const,
        },
        ShipmentStatus.delivered,
        "Delivered to customer",
      );

      const saved = mockShipmentRepo.save.mock.calls[0]![0] as any;
      expect(saved.status).toBe(ShipmentStatus.delivered);
      expect(saved.delivered_at).toBeDefined();
      expect(mockShipmentItemRepo.save).toHaveBeenCalled();
      expect(mockOrderItemRepo.save).not.toHaveBeenCalled();
      expect(mockOrderStatusService.transitionVendorOrder).toHaveBeenCalledWith(
        "vo-1",
        OrderStatus.delivered,
        { userId: "vendor-1", role: "system" },
        "Delivered to customer",
        undefined,
      );
    });

    it("triggers out_for_delivery order transition", async () => {
      mockShipmentRepo.findOne.mockResolvedValueOnce({
        id: "shipment-1",
        vendor_id: "vendor-1",
        vendor_order_id: "vo-1",
        status: ShipmentStatus.in_transit,
        items: [],
      });

      await service.transitionShipmentStatus(
        "shipment-1",
        {
          userId: "vendor-1",
          role: "vendor" as const,
        },
        ShipmentStatus.out_for_delivery,
        "Out for delivery now",
      );

      expect(mockOrderStatusService.transitionVendorOrder).toHaveBeenCalledWith(
        "vo-1",
        OrderStatus.out_for_delivery,
        { userId: "vendor-1", role: "system" },
        "Out for delivery now",
        undefined,
      );
    });

    // `shipment.items` is ShipmentItem[], and is_delivered/delivered_at are
    // ShipmentItem columns. Saving them through orderItemRepo made TypeORM map
    // them onto OrderItem metadata and emit INSERT INTO order_items with a null
    // order_id -> 23502, aborting the whole delivered transition with a 500.
    // Every other test here passes `items: []`, which short-circuits the branch.
    it("marks shipment items delivered via the shipment-item repo, not the order-item repo", async () => {
      mockShipmentRepo.findOne.mockResolvedValueOnce({
        id: "shipment-1",
        vendor_id: "vendor-1",
        vendor_order_id: "vo-1",
        status: ShipmentStatus.out_for_delivery,
        items: [{ id: "si-1", shipment_id: "shipment-1", order_item_id: "oi-1", quantity: 1 }],
      });

      await service.transitionShipmentStatus(
        "shipment-1",
        { userId: "vendor-1", role: "vendor" as const },
        ShipmentStatus.delivered,
        "Delivered to customer",
      );

      expect(mockOrderItemRepo.save).not.toHaveBeenCalled();
      expect(mockShipmentItemRepo.save).toHaveBeenCalled();
      const saved = mockShipmentItemRepo.save.mock.calls.at(-1)![0] as any[];
      expect(saved[0].id).toBe("si-1");
      expect(saved[0].is_delivered).toBe(true);
      expect(saved[0].delivered_at).toBeInstanceOf(Date);
    });
  });

  describe("getShipmentEvents", () => {
    it("returns the shipment's carrier events ordered by occurred_at", async () => {
      const events: any[] = [
        {
          id: "e1",
          shipment_id: "s1",
          status: ShipmentStatus.in_transit,
          description: "Pickup Dispatch",
          occurred_at: new Date("2026-07-14T11:47:00Z"),
          raw_payload: { ActionCode: "PICKDIS" },
        },
      ];
      mockShipmentEventRepo.find.mockResolvedValueOnce(events);

      const result = await service.getShipmentEvents("s1");

      expect(mockShipmentEventRepo.find).toHaveBeenCalledWith({
        where: { shipment_id: "s1" },
        order: { occurred_at: "ASC", created_at: "ASC" },
      });
      expect(result).toEqual(events);
    });
  });

  describe("carrier cost stamping", () => {
    const shippableVendorOrder = {
      id: "vo-1",
      vendor_id: "vendor-1",
      order_id: "order-1",
      status: OrderStatus.processing,
      items: [{ id: "oi-1", quantity: 2 }],
    };

    function makeServiceWithSetting(settingRow: any) {
      const siteSettingRepo = {
        findOne: mock((_args?: any) => Promise.resolve(settingRow)),
      };
      const svc = new ShipmentTrackingService(
        mockShipmentRepo as any,
        mockShipmentItemRepo as any,
        mockShipmentEventRepo as any,
        mockVendorOrderRepo as any,
        mockOrderItemRepo as any,
        mockOrderStatusService as any,
        mockShipmentStatusHistoryRepo as any,
        undefined,
        siteSettingRepo as any,
      );
      return { svc, siteSettingRepo };
    }

    it("stamps the configured rate onto the shipment", async () => {
      mockVendorOrderRepo.findOne.mockResolvedValueOnce({ ...shippableVendorOrder });
      const { svc } = makeServiceWithSetting({ value: "1300" });

      await svc.createShipment("vo-1", "vendor-1", {
        tracking_number: "TRK-1",
        carrier: "postaplus",
        items: [{ order_item_id: "oi-1", quantity: 1 }],
      });

      const created = mockShipmentRepo.create.mock.calls[0]![0] as any;
      expect(created.carrier_cost_fils).toBe(1300);
    });

    it("re-reads the setting on every call — a rate change takes effect on the next shipment", async () => {
      const siteSettingRepo = {
        findOne: mock(() => Promise.resolve({ value: "1300" })),
      };
      const svc = new ShipmentTrackingService(
        mockShipmentRepo as any,
        mockShipmentItemRepo as any,
        mockShipmentEventRepo as any,
        mockVendorOrderRepo as any,
        mockOrderItemRepo as any,
        mockOrderStatusService as any,
        mockShipmentStatusHistoryRepo as any,
        undefined,
        siteSettingRepo as any,
      );

      // Clear the create mock so this test's calls start fresh
      mockShipmentRepo.create.mockClear();

      // First shipment with rate 1300
      mockVendorOrderRepo.findOne.mockResolvedValueOnce({ ...shippableVendorOrder });
      await svc.createShipment("vo-1", "vendor-1", {
        tracking_number: "TRK-A",
        carrier: "postaplus",
        items: [{ order_item_id: "oi-1", quantity: 1 }],
      });

      // The admin changes the rate between shipments
      siteSettingRepo.findOne.mockImplementation(() => Promise.resolve({ value: "1500" }));

      // Second shipment should pick up the new rate
      mockVendorOrderRepo.findOne.mockResolvedValueOnce({ ...shippableVendorOrder });
      await svc.createShipment("vo-1", "vendor-1", {
        tracking_number: "TRK-B",
        carrier: "postaplus",
        items: [{ order_item_id: "oi-1", quantity: 1 }],
      });

      const calls = mockShipmentRepo.create.mock.calls;
      expect((calls[0]![0] as any).carrier_cost_fils).toBe(1300);
      expect((calls[1]![0] as any).carrier_cost_fils).toBe(1500);
      expect(siteSettingRepo.findOne).toHaveBeenCalledTimes(2);
    });

    it("falls back to 1300 when the setting row is absent", async () => {
      mockVendorOrderRepo.findOne.mockResolvedValueOnce({ ...shippableVendorOrder });
      const { svc } = makeServiceWithSetting(null);

      await svc.createShipment("vo-1", "vendor-1", {
        tracking_number: "TRK-3",
        carrier: "postaplus",
        items: [{ order_item_id: "oi-1", quantity: 1 }],
      });

      const created = mockShipmentRepo.create.mock.calls[0]![0] as any;
      expect(created.carrier_cost_fils).toBe(1300);
    });

    it("falls back to 1300 when siteSettingRepo is not wired at all", async () => {
      mockVendorOrderRepo.findOne.mockResolvedValueOnce({ ...shippableVendorOrder });

      // `service` (the shared instance) is constructed with 7 args, so
      // siteSettingRepo is undefined — the real shape in some wirings.
      await service.createShipment("vo-1", "vendor-1", {
        tracking_number: "TRK-4",
        carrier: "postaplus",
        items: [{ order_item_id: "oi-1", quantity: 1 }],
      });

      const created = mockShipmentRepo.create.mock.calls[0]![0] as any;
      expect(created.carrier_cost_fils).toBe(1300);
    });

    it("falls back to 1300 when the stored value is not a usable integer", async () => {
      mockVendorOrderRepo.findOne.mockResolvedValueOnce({ ...shippableVendorOrder });
      const { svc } = makeServiceWithSetting({ value: "not-a-number" });

      await svc.createShipment("vo-1", "vendor-1", {
        tracking_number: "TRK-5",
        carrier: "postaplus",
        items: [{ order_item_id: "oi-1", quantity: 1 }],
      });

      const created = mockShipmentRepo.create.mock.calls[0]![0] as any;
      expect(created.carrier_cost_fils).toBe(1300);
    });
  });
});
