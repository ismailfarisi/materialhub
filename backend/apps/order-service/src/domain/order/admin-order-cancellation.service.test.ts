import { describe, expect, it, mock } from "bun:test";
import { OrderStatus, PaymentStatus, ShipmentStatus } from "@materialhub/database/src/enums.ts";
import { AdminOrderCancellationService } from "./admin-order-cancellation.service.ts";

function makeUserRepo(user: any) {
  const save = mock(async (e: any) => e);
  const createQueryBuilder = mock(() => {
    const qb: any = {};
    qb.where = mock(() => qb);
    qb.setLock = mock(() => qb);
    qb.getOne = mock(async () => user);
    return qb;
  });
  return { createQueryBuilder, save };
}

describe("AdminOrderCancellationService", () => {
  it("refunds card payment, cancels PostaPlus shipment and pickup, marks shipment cancelled, and cancels the order", async () => {
    const order = {
      id: "order-1",
      status: OrderStatus.confirmed,
      grand_total: 25000,
      refund_total: 5000,
      payment_status: PaymentStatus.captured,
      user_id: "user-1",
    };
    const shipment = {
      id: "shipment-1",
      order_id: "order-1",
      vendor_id: "vendor-1",
      carrier: "postaplus",
      status: ShipmentStatus.pending,
      tracking_number: "102601526877",
      external_shipment_id: "102601526877",
      pickup_code: "PU230402791",
    };
    const orderRepo = {
      findOne: mock(async () => order),
      save: mock(async (entity: any) => entity),
    };
    const shipmentRepo = {
      find: mock(async () => [shipment]),
    };
    const vendorRepo = {
      findOne: mock(async () => ({ id: "vendor-1", default_shipping_account_id: null })),
    };
    const account = {
      credentials_encrypted: "encrypted",
      is_active: true,
      is_verified: true,
      provider: { code: "postaplus", is_active: true },
    };
    const accountRepo = {
      findOne: mock(async () => null),
      find: mock(async () => [account]),
    };
    const cancelShipment = mock(async () => ({ ok: true }));
    const cancelPickup = mock(async () => ({ ok: true }));
    const registry = {
      get: mock(() => ({ cancelShipment, cancelPickup })),
    };
    const encryption = {
      decryptObject: mock(() => ({ partner_key: "partner-1", tenant: "DXB" })),
    };
    const orderStatusService = {
      cancelOrder: mock(async () => ({ ...order, status: OrderStatus.cancelled })),
    };
    const shipmentTrackingService = {
      transitionShipmentStatus: mock(async () => ({
        ...shipment,
        status: ShipmentStatus.cancelled,
      })),
    };
    const refundService = {
      refundToOriginalPayment: mock(async () => ({
        gateway: "stripe",
        gatewayRefundId: "re_1",
        amount: 20000,
      })),
    };
    const paymentRepo = {
      findOne: mock(async () => ({ gateway: "stripe", status: "captured", amount: 25000 })),
    };
    const userRepo = makeUserRepo({ id: "user-1", wallet_balance: 0 });
    const walletTransactionRepo = {
      create: mock((d: any) => ({ id: "wtx-1", ...d })),
      save: mock(async (e: any) => e),
    };

    const service = new AdminOrderCancellationService(
      orderRepo as any,
      shipmentRepo as any,
      vendorRepo as any,
      accountRepo as any,
      orderStatusService as any,
      shipmentTrackingService as any,
      refundService as any,
      registry as any,
      encryption as any,
      paymentRepo as any,
      userRepo as any,
      walletTransactionRepo as any,
    );

    const result = await service.cancelOrderAsAdmin("order-1", "admin-1", {
      reason: "Customer requested cancellation",
      refund: true,
      cancel_fulfillment: true,
    });

    expect(cancelShipment).toHaveBeenCalledWith(
      { trackingNumber: "102601526877", reason: "Customer requested cancellation" },
      { partner_key: "partner-1", tenant: "DXB" },
    );
    expect(cancelPickup).toHaveBeenCalledWith(
      { pickupCode: "PU230402791", reason: "Customer requested cancellation" },
      { partner_key: "partner-1", tenant: "DXB" },
    );
    expect(shipmentTrackingService.transitionShipmentStatus).toHaveBeenCalledWith(
      "shipment-1",
      { userId: "admin-1", role: "admin" },
      ShipmentStatus.cancelled,
      "Customer requested cancellation",
      {
        carrier_cancelled: true,
        pickup_cancelled: true,
        carrier: "postaplus",
      },
    );
    expect(orderStatusService.cancelOrder).toHaveBeenCalledWith(
      "order-1",
      { userId: "admin-1", role: "admin" },
      "Customer requested cancellation",
    );
    expect(refundService.refundToOriginalPayment).toHaveBeenCalledWith({
      orderId: "order-1",
      amount: 20000,
      referenceType: "order_cancellation",
      referenceId: "order-1",
      reason: "requested_by_customer",
    });
    // Card path must never touch the wallet.
    expect(walletTransactionRepo.save).not.toHaveBeenCalled();
    expect(orderRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        refund_total: 25000,
        payment_status: PaymentStatus.refunded,
      }),
    );
    expect(result).toEqual({
      order: expect.objectContaining({ status: OrderStatus.cancelled }),
      refund: expect.objectContaining({ amount: 20000 }),
      cancelled_shipments: [
        {
          shipment_id: "shipment-1",
          carrier: "postaplus",
          carrier_cancelled: true,
          pickup_cancelled: true,
        },
      ],
    });
  });

  it("skips the refund for a COD order whose cash was never collected (payment still pending)", async () => {
    const order = {
      id: "order-2",
      status: OrderStatus.confirmed,
      grand_total: 25000,
      refund_total: 0,
      payment_status: PaymentStatus.pending,
      user_id: "user-2",
    };
    const orderRepo = {
      findOne: mock(async () => order),
      save: mock(async (entity: any) => entity),
    };
    const shipmentRepo = { find: mock(async () => []) };
    const vendorRepo = { findOne: mock(async () => null) };
    const accountRepo = { findOne: mock(async () => null), find: mock(async () => []) };
    const registry = { get: mock(() => null) };
    const encryption = { decryptObject: mock(() => ({})) };
    const orderStatusService = {
      cancelOrder: mock(async () => ({ ...order, status: OrderStatus.cancelled })),
    };
    const shipmentTrackingService = { transitionShipmentStatus: mock(async () => ({})) };
    const refundService = { refundToOriginalPayment: mock(async () => ({})) };
    const paymentRepo = {
      findOne: mock(async () => ({ gateway: "cod", status: "pending", amount: 25000 })),
    };
    const userRepo = makeUserRepo({ id: "user-2", wallet_balance: 0 });
    const walletTransactionRepo = {
      create: mock((d: any) => ({ id: "wtx-2", ...d })),
      save: mock(async (e: any) => e),
    };

    const service = new AdminOrderCancellationService(
      orderRepo as any,
      shipmentRepo as any,
      vendorRepo as any,
      accountRepo as any,
      orderStatusService as any,
      shipmentTrackingService as any,
      refundService as any,
      registry as any,
      encryption as any,
      paymentRepo as any,
      userRepo as any,
      walletTransactionRepo as any,
    );

    const result = await service.cancelOrderAsAdmin("order-2", "admin-1", {
      reason: "Never collected",
      refund: true,
      cancel_fulfillment: false,
    });

    expect(refundService.refundToOriginalPayment).not.toHaveBeenCalled();
    expect(walletTransactionRepo.save).not.toHaveBeenCalled();
    expect(userRepo.save).not.toHaveBeenCalled();
    expect(result.refund).toBeNull();
    expect(result.order).toEqual(expect.objectContaining({ status: OrderStatus.cancelled }));
  });

  it("refunds a COD order to the customer's wallet when cash was collected (payment captured)", async () => {
    const order = {
      id: "order-3",
      status: OrderStatus.delivered,
      grand_total: 25000,
      refund_total: 0,
      payment_status: PaymentStatus.captured,
      user_id: "user-3",
      admin_notes: null,
    };
    const orderRepo = {
      findOne: mock(async () => order),
      save: mock(async (entity: any) => entity),
    };
    const shipmentRepo = { find: mock(async () => []) };
    const vendorRepo = { findOne: mock(async () => null) };
    const accountRepo = { findOne: mock(async () => null), find: mock(async () => []) };
    const registry = { get: mock(() => null) };
    const encryption = { decryptObject: mock(() => ({})) };
    const orderStatusService = {
      cancelOrder: mock(async () => ({ ...order, status: OrderStatus.cancelled })),
    };
    const shipmentTrackingService = { transitionShipmentStatus: mock(async () => ({})) };
    const refundService = { refundToOriginalPayment: mock(async () => ({})) };
    const paymentRepo = {
      findOne: mock(async () => ({ gateway: "cod", status: "captured", amount: 25000 })),
    };
    const walletUser = { id: "user-3", wallet_balance: 1000 };
    const userRepo = makeUserRepo(walletUser);
    const walletTransactionRepo = {
      create: mock((d: any) => ({ id: "wtx-3", ...d })),
      save: mock(async (e: any) => e),
    };

    const service = new AdminOrderCancellationService(
      orderRepo as any,
      shipmentRepo as any,
      vendorRepo as any,
      accountRepo as any,
      orderStatusService as any,
      shipmentTrackingService as any,
      refundService as any,
      registry as any,
      encryption as any,
      paymentRepo as any,
      userRepo as any,
      walletTransactionRepo as any,
    );

    const result = await service.cancelOrderAsAdmin("order-3", "admin-1", {
      reason: "Returned after delivery",
      refund: true,
      cancel_fulfillment: false,
    });

    // No card refund for COD.
    expect(refundService.refundToOriginalPayment).not.toHaveBeenCalled();
    // Wallet credited for the full uncollected-back amount.
    expect(walletTransactionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-3",
        amount: 25000,
        balance_before: 1000,
        balance_after: 26000,
        transaction_type: "refund",
        order_id: "order-3",
        reference_type: "order_cancellation",
        reference_id: "order-3",
      }),
    );
    expect(walletUser.wallet_balance).toBe(26000);
    expect(userRepo.save).toHaveBeenCalled();
    expect(orderRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        refund_total: 25000,
        payment_status: PaymentStatus.refunded,
      }),
    );
    expect(result.refund).toEqual(expect.objectContaining({ gateway: "wallet", amount: 25000 }));
  });
});
