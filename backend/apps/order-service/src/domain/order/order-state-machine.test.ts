import { describe, expect, it } from "bun:test";
import { OrderStatus } from "@materialhub/database/src/enums/order.enums.ts";
import { OrderStateMachine } from "./order-state-machine.ts";

describe("OrderStateMachine", () => {
  const sm = new OrderStateMachine();

  describe("master order transitions", () => {
    it("allows draft → pending_payment by system", () => {
      expect(() =>
        sm.validateMasterTransition(OrderStatus.draft, OrderStatus.pending_payment, "system"),
      ).not.toThrow();
    });

    it("allows pending_payment → confirmed by system", () => {
      expect(() =>
        sm.validateMasterTransition(OrderStatus.pending_payment, OrderStatus.confirmed, "system"),
      ).not.toThrow();
    });

    it("allows confirmed → cancelled by buyer", () => {
      expect(() =>
        sm.validateMasterTransition(OrderStatus.confirmed, OrderStatus.cancelled, "buyer"),
      ).not.toThrow();
    });

    it("rejects processing → cancelled by buyer", () => {
      expect(() =>
        sm.validateMasterTransition(OrderStatus.processing, OrderStatus.cancelled, "buyer"),
      ).toThrow("Invalid transition");
    });

    it("allows admin to force cancel from any state", () => {
      const states = [
        OrderStatus.confirmed,
        OrderStatus.processing,
        OrderStatus.shipped,
        OrderStatus.delivered,
      ];
      for (const from of states) {
        expect(() =>
          sm.validateMasterTransition(from, OrderStatus.cancelled, "admin"),
        ).not.toThrow();
      }
    });

    it("allows processing → partially_shipped by system", () => {
      expect(() =>
        sm.validateMasterTransition(
          OrderStatus.processing,
          OrderStatus.partially_shipped,
          "system",
        ),
      ).not.toThrow();
    });

    it("allows partially_shipped → shipped by system", () => {
      expect(() =>
        sm.validateMasterTransition(OrderStatus.partially_shipped, OrderStatus.shipped, "system"),
      ).not.toThrow();
    });

    it("allows shipped → partially_delivered by system", () => {
      expect(() =>
        sm.validateMasterTransition(OrderStatus.shipped, OrderStatus.partially_delivered, "system"),
      ).not.toThrow();
    });

    it("allows partially_delivered → delivered by system", () => {
      expect(() =>
        sm.validateMasterTransition(
          OrderStatus.partially_delivered,
          OrderStatus.delivered,
          "system",
        ),
      ).not.toThrow();
    });

    it("allows partially_refunded → refunded by system", () => {
      expect(() =>
        sm.validateMasterTransition(OrderStatus.partially_refunded, OrderStatus.refunded, "system"),
      ).not.toThrow();
    });

    it("allows admin item-cancellation transitions to partially_refunded (ADMIN_BYPASS_TARGETS)", () => {
      const states = [OrderStatus.confirmed, OrderStatus.processing, OrderStatus.ready_to_ship];
      for (const from of states) {
        expect(() =>
          sm.validateMasterTransition(from, OrderStatus.partially_refunded, "admin"),
        ).not.toThrow();
      }
    });

    it("allows admin confirmed → refunded (ADMIN_BYPASS_TARGETS)", () => {
      expect(() =>
        sm.validateMasterTransition(OrderStatus.confirmed, OrderStatus.refunded, "admin"),
      ).not.toThrow();
    });

    it("rejects confirmed → partially_refunded by a non-admin role (privilege stays admin-scoped)", () => {
      expect(() =>
        sm.validateMasterTransition(
          OrderStatus.confirmed,
          OrderStatus.partially_refunded,
          "system",
        ),
      ).toThrow("Invalid transition");
    });

    it("rejects invalid transition", () => {
      expect(() =>
        sm.validateMasterTransition(OrderStatus.delivered, OrderStatus.confirmed, "system"),
      ).toThrow("Invalid transition");
    });

    it("rejects wrong role for transition", () => {
      expect(() =>
        sm.validateMasterTransition(OrderStatus.pending_payment, OrderStatus.confirmed, "buyer"),
      ).toThrow("Invalid transition");
    });

    it("is idempotent (same from/to = no-op)", () => {
      const result = sm.validateMasterTransition(
        OrderStatus.confirmed,
        OrderStatus.confirmed,
        "system",
      );
      expect(result).toEqual({ noop: true });
    });
  });

  describe("vendor order transitions", () => {
    it("allows confirmed → processing by vendor", () => {
      expect(() =>
        sm.validateVendorTransition(OrderStatus.confirmed, OrderStatus.processing, "vendor"),
      ).not.toThrow();
    });

    it("allows confirmed → cancelled by vendor (reject)", () => {
      expect(() =>
        sm.validateVendorTransition(OrderStatus.confirmed, OrderStatus.cancelled, "vendor"),
      ).not.toThrow();
    });

    it("allows confirmed → cancelled by system (buyer cancel cascade)", () => {
      expect(() =>
        sm.validateVendorTransition(OrderStatus.confirmed, OrderStatus.cancelled, "system"),
      ).not.toThrow();
    });

    it("allows processing → ready_to_ship by vendor", () => {
      expect(() =>
        sm.validateVendorTransition(OrderStatus.processing, OrderStatus.ready_to_ship, "vendor"),
      ).not.toThrow();
    });

    it("allows ready_to_ship → shipped by vendor", () => {
      expect(() =>
        sm.validateVendorTransition(OrderStatus.ready_to_ship, OrderStatus.shipped, "vendor"),
      ).not.toThrow();
    });

    // Auto-booked shipments defer the ready_to_ship → shipped hop to the carrier
    // webhook, which transitions the vendor_order as the "system" actor. Without
    // this, every auto-booked order froze at ready_to_ship (the transition threw
    // and was swallowed by the webhook handler's catch).
    it("allows ready_to_ship → shipped by system (auto-booked carrier webhook)", () => {
      expect(() =>
        sm.validateVendorTransition(OrderStatus.ready_to_ship, OrderStatus.shipped, "system"),
      ).not.toThrow();
    });

    it("allows shipped → delivered by system (skip out_for_delivery)", () => {
      expect(() =>
        sm.validateVendorTransition(OrderStatus.shipped, OrderStatus.delivered, "system"),
      ).not.toThrow();
    });

    it("allows admin to force cancel from any state", () => {
      expect(() =>
        sm.validateVendorTransition(OrderStatus.processing, OrderStatus.cancelled, "admin"),
      ).not.toThrow();
    });

    it("rejects vendor cancelling after processing", () => {
      expect(() =>
        sm.validateVendorTransition(OrderStatus.processing, OrderStatus.cancelled, "vendor"),
      ).toThrow("Invalid transition");
    });

    it("rejects buyer role entirely", () => {
      expect(() =>
        sm.validateVendorTransition(OrderStatus.confirmed, OrderStatus.processing, "buyer"),
      ).toThrow("Invalid transition");
    });
  });
});
