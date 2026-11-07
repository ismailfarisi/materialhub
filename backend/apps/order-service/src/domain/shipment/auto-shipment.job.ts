import { config } from "@materialhub/config";
import type { VendorCarrierAccount } from "@materialhub/database/src/entities/vendor-carrier-account.entity.ts";
import { OrderStatus } from "@materialhub/database/src/enums/order.enums.ts";
import type { EncryptionService } from "@materialhub/utils";
import { Queue, Worker } from "bullmq";
import { IsNull, type Repository } from "typeorm";
import type { OrderStatusService } from "../order/order-status.service.ts";
import type { ShipmentTrackingService } from "./shipment-tracking.service.ts";
import type { ShippingProviderRegistry } from "./shipping-provider-adapter.ts";

export const AUTO_SHIPMENT_QUEUE = "auto-shipment";

export interface AutoShipmentJob {
  orderId: string;
  vendorOrderId: string;
  vendorId: string;
  /** Admin-triggered retry: bypasses the vendor's auto_create_shipment opt-in. */
  manual?: boolean;
}

export interface AutoShipmentDeps {
  vendorRepo: Repository<any>;
  vendorOrderRepo: Repository<any>;
  accountRepo: Repository<VendorCarrierAccount>;
  warehouseRepo: Repository<any>;
  orderStatusService: OrderStatusService;
  shipmentService: ShipmentTrackingService;
  registry: ShippingProviderRegistry;
  encryption: EncryptionService;
}

let autoShipmentQueue: Queue | null = null;

export function getAutoShipmentQueue(): Queue {
  if (!autoShipmentQueue) {
    autoShipmentQueue = new Queue(AUTO_SHIPMENT_QUEUE, {
      connection: { url: config.bullmq.redisUrl },
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
      },
    });
  }
  return autoShipmentQueue;
}

/**
 * Enqueue a booking job for every vendor sub-order of a paid/committed order.
 * Called from the payment-confirmation sinks (prepaid webhook, COD checkout).
 * jobId dedupes against double-fires; the processor additionally skips
 * non-confirmed sub-orders and the manual admin retry adds without a jobId.
 */
export async function enqueueAutoShipmentsForOrder(
  orderId: string,
  vendorOrderRepo: Repository<any>,
  queue: Queue = getAutoShipmentQueue(),
): Promise<void> {
  const vendorOrders = await vendorOrderRepo.find({ where: { order_id: orderId } });
  for (const vendorOrder of vendorOrders) {
    await queue.add(
      "auto-shipment",
      { orderId, vendorOrderId: vendorOrder.id, vendorId: vendorOrder.vendor_id },
      { jobId: `auto-ship-${vendorOrder.id}` },
    );
  }
}

export async function processAutoShipmentJob(
  job: AutoShipmentJob,
  deps: AutoShipmentDeps,
): Promise<void> {
  const { vendorOrderId, vendorId } = job;

  const vendor = await deps.vendorRepo.findOne({ where: { id: vendorId } });
  if (!vendor) return;
  if (!vendor.auto_create_shipment && !job.manual) return;

  const account = await resolveShippingAccount(deps.accountRepo, vendor);
  if (!account) return;

  const adapter = deps.registry.get(account.provider.code);
  if (!adapter) throw new Error(`Provider '${account.provider.code}' not registered`);

  const vendorOrder = await deps.vendorOrderRepo.findOne({
    where: { id: vendorOrderId },
    relations: ["items", "order", "order.payments", "order.user"],
  });
  if (!vendorOrder || vendorOrder.status !== OrderStatus.confirmed) return;

  const creds = deps.encryption.decryptObject<Record<string, string>>(
    account.credentials_encrypted,
  );

  // Ship to the customer's address snapshot on the master order.
  const shipTo = {
    ...((vendorOrder.order?.shipping_address ?? {}) as Record<string, unknown>),
  } as Record<string, unknown>;
  // PostaPlus requires a consignee email; address snapshots predating the
  // email field fall back to the account email of the ordering user.
  if (!shipTo.email && vendorOrder.order?.user?.email) {
    shipTo.email = vendorOrder.order.user.email;
  }
  const originWarehouse = await resolveOriginWarehouse(deps.warehouseRepo, vendorOrder, vendorId);
  const originAddress = originWarehouse ? warehouseToCarrierAddress(originWarehouse) : undefined;

  const bookingResult = await adapter.bookShipment(
    {
      vendorOrderId,
      items: vendorOrder.items.map((i: any) => ({
        productName: i.product_name,
        quantity: i.quantity,
        weightGrams: 500,
        externalId: i.external_id ?? null,
      })),
      shippingAddress: shipTo as unknown as Record<string, unknown>,
      shipperAddress: originAddress,
      pickupAddress: originAddress,
      codAmountFils: resolveCodAmountFils(vendorOrder.order),
    },
    creds,
  );

  await deps.vendorOrderRepo.update(vendorOrderId, {
    carrier_cost: bookingResult.carrier_cost_fils,
    booking_error: null,
  });

  // A background job has no acting user: history records changed_by NULL
  // (changed_by is an FK to users; the vendor id is not a user id).
  const jobActor = { userId: null, vendorId, role: "vendor" as const };
  await deps.orderStatusService.transitionVendorOrder(
    vendorOrderId,
    OrderStatus.processing,
    jobActor,
  );
  await deps.orderStatusService.transitionVendorOrder(
    vendorOrderId,
    OrderStatus.ready_to_ship,
    jobActor,
  );

  await deps.shipmentService.createShipment(vendorOrderId, vendorId, {
    auto_booked: true,
    tracking_number: bookingResult.tracking_number,
    carrier: account.provider.code,
    tracking_url: bookingResult.tracking_url,
    external_shipment_id: bookingResult.external_shipment_id,
    label_url: bookingResult.label_url,
    pickup_code: bookingResult.pickup_code,
    estimated_delivery_at: bookingResult.estimated_delivery_at?.toISOString(),
    items: vendorOrder.items.map((i: any) => ({
      order_item_id: i.id,
      quantity: i.quantity,
    })),
  });
}

/**
 * Vendors ship via the platform's own carrier account (vendor_id NULL row)
 * by default; a vendor's verified default account is an opt-in override.
 */
export async function resolveShippingAccount(
  accountRepo: Repository<VendorCarrierAccount>,
  vendor: { default_shipping_account_id?: string | null } | null,
): Promise<VendorCarrierAccount | null> {
  const usable = (account: VendorCarrierAccount | null): account is VendorCarrierAccount =>
    Boolean(account?.is_active && account?.is_verified && account?.provider?.is_active);

  if (vendor?.default_shipping_account_id) {
    const own = await accountRepo.findOne({
      where: { id: vendor.default_shipping_account_id, is_active: true, is_verified: true },
      relations: ["provider"],
    });
    if (usable(own)) return own;
  }
  const platformAccounts = await accountRepo.find({
    where: { vendor_id: IsNull(), is_active: true, is_verified: true },
    relations: ["provider"],
    order: { verified_at: "DESC" },
  });
  return platformAccounts.find((account) => usable(account)) ?? null;
}

export async function resolveOriginWarehouse(
  warehouseRepo: Repository<any>,
  vendorOrder: any,
  vendorId: string,
): Promise<any | null> {
  if (vendorOrder.warehouse_id) {
    const stamped = await warehouseRepo.findOne({
      where: { id: vendorOrder.warehouse_id, is_active: true } as any,
    });
    if (stamped) return stamped;
  }
  return warehouseRepo.findOne({
    where: { vendor_id: vendorId, is_default: true, is_active: true } as any,
  });
}

export function warehouseToCarrierAddress(warehouse: any): Record<string, unknown> {
  const postaplus = (warehouse.operating_hours as any)?.postaplus ?? {};
  return {
    name: warehouse.name,
    phone: warehouse.contact_phone,
    email: warehouse.contact_email,
    address_line_1: warehouse.address_line_1,
    address_line_2: warehouse.address_line_2,
    city: warehouse.city,
    emirate: warehouse.emirate,
    country_code: warehouse.country_code,
    latitude: warehouse.latitude,
    longitude: warehouse.longitude,
    province_code: postaplus.province_code ?? warehouse.emirate,
    city_code: postaplus.city_code,
    area_code: postaplus.area_code ?? "NA",
    building_name_or_number: postaplus.building_name_or_number,
    street_name_or_number: postaplus.street_name_or_number,
    block_or_district: postaplus.block_or_district,
    postal_code: postaplus.postal_code,
  };
}

export function resolveCodAmountFils(order: any): number | undefined {
  const codPayment = order?.payments?.find((payment: any) => {
    const method = String(payment.payment_method ?? "").toLowerCase();
    const gateway = String(payment.gateway ?? "").toLowerCase();
    return method === "cash_on_delivery" || method === "cod" || gateway === "cod";
  });
  const amount = Number(codPayment?.amount);
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  const refundTotal = Number(order?.refund_total ?? 0);
  const net = Math.max(0, amount - (Number.isFinite(refundTotal) ? refundTotal : 0));
  return net > 0 ? net : undefined;
}

/**
 * BullMQ `failed` listener for booking jobs. Always logs; on the final
 * attempt also persists the reason to vendor_orders.booking_error so the
 * admin panel can surface it next to the Book Shipment retry button.
 */
export async function handleAutoShipmentFailure(
  job: { data?: AutoShipmentJob; attemptsMade: number; opts?: { attempts?: number } } | undefined,
  err: Error,
  vendorOrderRepo: Repository<any>,
): Promise<void> {
  const vendorOrderId = job?.data?.vendorOrderId;
  if (!vendorOrderId) return;
  const maxAttempts = job?.opts?.attempts ?? 1;
  const isFinalAttempt = (job?.attemptsMade ?? 0) >= maxAttempts;
  console.error("[auto-shipment] booking attempt failed", {
    orderId: job?.data?.orderId,
    vendorOrderId,
    attempt: job?.attemptsMade,
    maxAttempts,
    final: isFinalAttempt,
    error: err.message,
  });
  if (!isFinalAttempt) return;
  try {
    await vendorOrderRepo.update(vendorOrderId, { booking_error: err.message });
  } catch (persistErr) {
    console.error("[auto-shipment] failed to persist booking_error", {
      vendorOrderId,
      error: String(persistErr),
    });
  }
}

export function createAutoShipmentWorker(
  vendorRepo: Repository<any>,
  vendorOrderRepo: Repository<any>,
  accountRepo: Repository<VendorCarrierAccount>,
  orderStatusService: OrderStatusService,
  shipmentService: ShipmentTrackingService,
  registry: ShippingProviderRegistry,
  encryption: EncryptionService,
  warehouseRepo: Repository<any>,
): Worker {
  const deps: AutoShipmentDeps = {
    vendorRepo,
    vendorOrderRepo,
    accountRepo,
    warehouseRepo,
    orderStatusService,
    shipmentService,
    registry,
    encryption,
  };
  const worker = new Worker(
    AUTO_SHIPMENT_QUEUE,
    async (job) => processAutoShipmentJob(job.data as AutoShipmentJob, deps),
    { connection: { url: config.bullmq.redisUrl }, concurrency: 1 },
  );
  worker.on("failed", (job, err) => {
    void handleAutoShipmentFailure(job as any, err, vendorOrderRepo);
  });
  return worker;
}
