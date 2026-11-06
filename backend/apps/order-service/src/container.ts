import { config } from "@materialhub/config";
import { AppDataSource, ensureDatabase } from "@materialhub/database";
import {
  AuditLog,
  Cart,
  CartItem,
  Category,
  Commission,
  Coupon,
  CouponCategory,
  CouponExcludedProduct,
  CouponProduct,
  CouponUsage,
  CouponUserRestriction,
  CouponVendor,
  DeliveryZone,
  Dispute,
  DisputeMessage,
  Inventory,
  InventoryMovement,
  InventoryReservation,
  Order,
  OrderItem,
  OrderItemCancellation,
  OrderStatusHistory,
  Payment,
  PaymentMethodThreshold,
  Product,
  ProductCollectionMember,
  ProductVariant,
  PublicHoliday,
  Return,
  ReturnItem,
  Review,
  ReviewVote,
  RulesEpoch,
  Shipment,
  ShipmentEvent,
  ShipmentItem,
  ShipmentStatusHistory,
  ShippingContributionTier,
  ShippingProvider,
  ShippingRate,
  SiteSetting,
  TaxRate,
  User,
  UserAddress,
  Vendor,
  VendorBankAccount,
  VendorCarrierAccount,
  VendorOrder,
  VendorPayout,
  VendorPayoutAdjustment,
  WalletTransaction,
  Warehouse,
  WarehouseVendorPermission,
  WebhookEvent,
} from "@materialhub/database";
import { getIntegrationEventsQueue } from "@materialhub/integration-events";
import { EncryptionService, MediaService } from "@materialhub/utils";
import { Elysia } from "elysia";
import { createClient } from "redis";
import Stripe from "stripe";

import { Worker as BullWorker, Queue } from "bullmq";
import {
  createCartAbandonmentDetectionWorker,
  getCartAbandonmentDetectionQueue,
  scheduleCartAbandonmentDetection,
} from "./domain/cart-abandonment/cart-abandonment-detection.job.ts";
import {
  createCartAbandonmentPurgeWorker,
  getCartAbandonmentPurgeQueue,
  scheduleCartAbandonmentPurge,
} from "./domain/cart-abandonment/cart-abandonment-purge.job.ts";
import {
  createCartAbandonmentReminderWorker,
  getCartAbandonmentReminderQueue,
  scheduleCartAbandonmentReminder,
} from "./domain/cart-abandonment/cart-abandonment-reminder.job.ts";
import { CartAbandonmentController } from "./domain/cart-abandonment/cart-abandonment.controller.ts";
import { CartAbandonmentService } from "./domain/cart-abandonment/cart-abandonment.service.ts";
import { CartMergeService } from "./domain/cart/cart-merge.service.ts";
import { CartRedisService } from "./domain/cart/cart-redis.service.ts";
import { CartController } from "./domain/cart/cart.controller.ts";
import { CartService } from "./domain/cart/cart.service.ts";
import { CheckoutController } from "./domain/checkout/checkout.controller.ts";
import { CheckoutService } from "./domain/checkout/checkout.service.ts";
import { CouponService } from "./domain/checkout/coupon.service.ts";
import { OrderConfirmationService } from "./domain/checkout/order-confirmation.service.ts";
import { OrderCreationService } from "./domain/checkout/order-creation.service.ts";
import { PaymentService } from "./domain/checkout/payment.service.ts";
import { PaymentInstrumentsService } from "./domain/checkout/quote/payment-instruments.service.ts";
import { QuoteController } from "./domain/checkout/quote/quote.controller.ts";
import { QuoteService } from "./domain/checkout/quote/quote.service.ts";
import { RulesEpochService } from "./domain/checkout/quote/rules-epoch.service.ts";
import { TaxService } from "./domain/checkout/tax.service.ts";
import { WebhookService } from "./domain/checkout/webhook.service.ts";
import { AdminPayoutController } from "./domain/commission/admin-payout.controller.ts";
import { CommissionReversalService } from "./domain/commission/commission-reversal.service.ts";
import {
  createCommissionSettlementWorker,
  getCommissionSettlementQueue,
  scheduleCommissionSettlement,
} from "./domain/commission/commission-settlement.job.ts";
import { CommissionController } from "./domain/commission/commission.controller.ts";
import { CommissionService } from "./domain/commission/commission.service.ts";
import { PayoutAdjustmentService } from "./domain/commission/payout-adjustment.service.ts";
import {
  createPayoutDraftWorker,
  getPayoutDraftQueue,
  schedulePayoutDraftGeneration,
} from "./domain/commission/payout-draft.job.ts";
import { createPayoutWorker } from "./domain/commission/payout.job.ts";
import { PayoutService } from "./domain/commission/payout.service.ts";
import { CouponAdminService } from "./domain/coupon/coupon-admin.service.ts";
import { CouponController } from "./domain/coupon/coupon.controller.ts";
import { DashboardController } from "./domain/dashboard/dashboard.controller.ts";
import { DashboardService } from "./domain/dashboard/dashboard.service.ts";
import { DisputeController } from "./domain/disputes/dispute.controller.ts";
import { DisputeService } from "./domain/disputes/dispute.service.ts";
import { createInvoiceWorker, getOrderInvoicesQueue } from "./domain/invoice/invoice.job.ts";
import { InvoiceService } from "./domain/invoice/invoice.service.ts";
import { AdminOrderCancellationService } from "./domain/order/admin-order-cancellation.service.ts";
import { getOrderEventQueue } from "./domain/order/order-event.job.ts";
import { ORDER_EVENT_QUEUE } from "./domain/order/order-event.job.ts";
import { OrderItemCancellationService } from "./domain/order/order-item-cancellation.service.ts";
import { OrderStatusService } from "./domain/order/order-status.service.ts";
import { OrderController } from "./domain/order/order.controller.ts";
import { OrderQueryService } from "./domain/order/order.service.ts";
import {
  createPendingOrderReaperWorker,
  getPendingOrderReaperQueue,
  schedulePendingOrderReaper,
} from "./domain/order/pending-order-reaper.job.ts";
import { PendingOrderReaperService } from "./domain/order/pending-order-reaper.service.ts";
import { VendorOrderController } from "./domain/order/vendor-order.controller.ts";
import { VendorOrderService } from "./domain/order/vendor-order.service.ts";
import { VerifiedPurchaseService } from "./domain/order/verified-purchase.service.ts";
import { PromotionsService } from "./domain/promotions/promotions.service.ts";
import { RefundService } from "./domain/refund/refund.service.ts";
import { ReturnController } from "./domain/returns/return.controller.ts";
import { ReturnService } from "./domain/returns/return.service.ts";
import {
  createReviewRatingWorker,
  getReviewRatingQueue,
} from "./domain/reviews/review-rating.job.ts";
import { ReviewController } from "./domain/reviews/review.controller.ts";
import { ReviewService } from "./domain/reviews/review.service.ts";
import {
  createAutoShipmentWorker,
  enqueueAutoShipmentsForOrder,
  getAutoShipmentQueue,
} from "./domain/shipment/auto-shipment.job.ts";
import { MockShippingProviderAdapter } from "./domain/shipment/mock-shipping-provider.adapter.ts";
import {
  createPostaPlusTrackingPollWorker,
  getPostaPlusTrackingPollQueue,
  schedulePostaPlusTrackingPoll,
} from "./domain/shipment/postaplus-tracking-poll.job.ts";
import { PostaPlusAdapter } from "./domain/shipment/postaplus.adapter.ts";
import { ShipmentTrackingController } from "./domain/shipment/shipment-tracking.controller.ts";
import { ShipmentTrackingService } from "./domain/shipment/shipment-tracking.service.ts";
import { ShippingProviderRegistry } from "./domain/shipment/shipping-provider-adapter.ts";
import { upsertProvidersFromRegistry } from "./domain/shipment/upsert-providers-from-registry.ts";
import { DeliveryEstimateService } from "./domain/shipping/estimate/delivery-estimate.service.ts";
import { PublicHolidayService } from "./domain/shipping/estimate/public-holiday.service.ts";
import { ShippingController } from "./domain/shipping/shipping.controller.ts";
import { ShippingService } from "./domain/shipping/shipping.service.ts";

await ensureDatabase();

const redisClient = createClient({
  socket: {
    host: config.redis.host,
    port: config.redis.port,
  },
  password: config.redis.password,
});
redisClient.connect().catch((err: any) => console.error("Redis connect error:", err));

const stripe = config.stripe.secretKey
  ? new Stripe(config.stripe.secretKey, { apiVersion: "2026-03-25.dahlia" })
  : (null as unknown as Stripe);

const encryption = new EncryptionService(config.encryption.key);
// vendor-service encrypts vendor_bank_accounts with config.vendor.encryptionKey
// (VENDOR_ENCRYPTION_KEY), NOT config.encryption.key. Decrypting those rows
// with the `encryption` instance above silently fails — different key, same
// algorithm — so the reveal path gets its own instance keyed to match the
// writer. See vendor-service/src/container.ts:26.
const vendorEncryption = new EncryptionService(config.vendor.encryptionKey);

const cartRepo = AppDataSource.getRepository(Cart);
const cartItemRepo = AppDataSource.getRepository(CartItem);
const inventoryRepo = AppDataSource.getRepository(Inventory);
const inventoryMovementRepo = AppDataSource.getRepository(InventoryMovement);
const inventoryReservationRepo = AppDataSource.getRepository(InventoryReservation);
const productRepo = AppDataSource.getRepository(Product);
const productVariantRepo = AppDataSource.getRepository(ProductVariant);
const deliveryZoneRepo = AppDataSource.getRepository(DeliveryZone);
const shippingProviderRepo = AppDataSource.getRepository(ShippingProvider);
const shippingRateRepo = AppDataSource.getRepository(ShippingRate);
const shippingContributionTierRepo = AppDataSource.getRepository(ShippingContributionTier);
const vendorCarrierAccountRepo = AppDataSource.getRepository(VendorCarrierAccount);
const warehouseRepo = AppDataSource.getRepository(Warehouse);
const warehouseVendorPermissionRepo = AppDataSource.getRepository(WarehouseVendorPermission);
const taxRateRepo = AppDataSource.getRepository(TaxRate);
const couponRepo = AppDataSource.getRepository(Coupon);
const couponUsageRepo = AppDataSource.getRepository(CouponUsage);
const couponProductRepo = AppDataSource.getRepository(CouponProduct);
const couponCategoryRepo = AppDataSource.getRepository(CouponCategory);
const couponVendorRepo = AppDataSource.getRepository(CouponVendor);
const couponExcludedProductRepo = AppDataSource.getRepository(CouponExcludedProduct);
const couponUserRestrictionRepo = AppDataSource.getRepository(CouponUserRestriction);
const orderRepo = AppDataSource.getRepository(Order);
const paymentRepo = AppDataSource.getRepository(Payment);
const vendorOrderRepo = AppDataSource.getRepository(VendorOrder);
const orderItemRepo = AppDataSource.getRepository(OrderItem);
const orderItemCancellationRepo = AppDataSource.getRepository(OrderItemCancellation);
const orderStatusHistoryRepo = AppDataSource.getRepository(OrderStatusHistory);
const webhookEventRepo = AppDataSource.getRepository(WebhookEvent);
const vendorRepo = AppDataSource.getRepository(Vendor);
const vendorBankAccountRepo = AppDataSource.getRepository(VendorBankAccount);
const categoryRepo = AppDataSource.getRepository(Category);
const commissionRepo = AppDataSource.getRepository(Commission);
const vendorPayoutRepo = AppDataSource.getRepository(VendorPayout);
const vendorPayoutAdjustmentRepo = AppDataSource.getRepository(VendorPayoutAdjustment);
const auditLogRepo = AppDataSource.getRepository(AuditLog);
const shipmentRepo = AppDataSource.getRepository(Shipment);
const shipmentItemRepo = AppDataSource.getRepository(ShipmentItem);
const shipmentEventRepo = AppDataSource.getRepository(ShipmentEvent);
const shipmentStatusHistoryRepo = AppDataSource.getRepository(ShipmentStatusHistory);
const returnRepo = AppDataSource.getRepository(Return);
const returnItemRepo = AppDataSource.getRepository(ReturnItem);
const disputeRepo = AppDataSource.getRepository(Dispute);
const disputeMessageRepo = AppDataSource.getRepository(DisputeMessage);
const walletTransactionRepo = AppDataSource.getRepository(WalletTransaction);
const userRepo = AppDataSource.getRepository(User);
const reviewRepo = AppDataSource.getRepository(Review);
const reviewVoteRepo = AppDataSource.getRepository(ReviewVote);
const siteSettingRepo = AppDataSource.getRepository(SiteSetting);
const paymentMethodThresholdRepo = AppDataSource.getRepository(PaymentMethodThreshold);
const rulesEpochRepo = AppDataSource.getRepository(RulesEpoch);
const userAddressRepo = AppDataSource.getRepository(UserAddress);
const productCollectionMemberRepo = AppDataSource.getRepository(ProductCollectionMember);

const integrationEventsQueue = getIntegrationEventsQueue();

const cartRedisService = new CartRedisService(redisClient as any);
const cartService = new CartService(
  cartRepo,
  cartItemRepo,
  inventoryRepo,
  productRepo,
  productVariantRepo,
  cartRedisService,
);
const cartMergeService = new CartMergeService(cartRepo, cartItemRepo, cartRedisService);
const cartController = new CartController(cartService, cartMergeService);

const shippingService = new ShippingService(
  deliveryZoneRepo,
  shippingRateRepo,
  warehouseRepo,
  warehouseVendorPermissionRepo,
);
const shippingController = new ShippingController(shippingService);
const deliveryEstimateService = new DeliveryEstimateService(
  warehouseRepo,
  productRepo,
  shippingRateRepo,
  AppDataSource.getRepository(PublicHoliday),
);
const publicHolidayService = new PublicHolidayService(
  AppDataSource.getRepository(PublicHoliday),
  () => deliveryEstimateService.invalidateHolidays(),
);

const taxService = new TaxService(taxRateRepo);
const couponService = new CouponService(
  couponRepo,
  couponUsageRepo,
  orderRepo,
  userRepo,
  productCollectionMemberRepo,
);
const paymentService = new PaymentService(paymentRepo, stripe, orderRepo, config.tamara);
const commissionService = new CommissionService(
  commissionRepo,
  vendorRepo,
  categoryRepo,
  siteSettingRepo,
);
// Constructed here (ahead of orderStatusService, not down by the other
// payout wiring below) so cancelOrder (CRITICAL 1) can invalidate a draft
// whose claim survives a cancel-voided commission. PayoutService has no
// dependency back on anything in the order domain, so this is purely a
// construction-order move, not a circular import — see
// order-status.service.ts's `draftInvalidator` param for the narrow
// interface it actually depends on.
const payoutService = new PayoutService(
  vendorPayoutRepo,
  commissionRepo,
  stripe,
  vendorOrderRepo,
  auditLogRepo,
  vendorRepo,
  vendorBankAccountRepo,
  vendorPayoutAdjustmentRepo,
);
const orderCreationService = new OrderCreationService(
  orderRepo,
  vendorOrderRepo,
  orderItemRepo,
  orderStatusHistoryRepo,
  inventoryRepo,
  inventoryReservationRepo,
  inventoryMovementRepo,
  integrationEventsQueue,
  siteSettingRepo,
  commissionService,
  shippingContributionTierRepo,
);
const orderEventQueue = getOrderEventQueue();
const orderStatusService = new OrderStatusService(
  orderRepo,
  vendorOrderRepo,
  orderStatusHistoryRepo,
  orderEventQueue,
  integrationEventsQueue,
  siteSettingRepo,
  inventoryRepo,
  commissionService,
  payoutService,
);
const invoiceQueue = getOrderInvoicesQueue();
const invoiceService = new InvoiceService(orderRepo, new MediaService());
const orderConfirmationService = new OrderConfirmationService(
  orderRepo,
  inventoryReservationRepo,
  orderStatusHistoryRepo,
  cartService,
  (orderId) => enqueueAutoShipmentsForOrder(orderId, vendorOrderRepo),
  orderEventQueue,
  couponService,
  invoiceQueue,
);
const webhookService = new WebhookService(
  webhookEventRepo,
  paymentRepo,
  orderConfirmationService,
  orderStatusService,
  config.tamara,
);
const rulesEpochService = new RulesEpochService(rulesEpochRepo);
const quoteSecret = process.env.QUOTE_TOKEN_KEY ?? "dev-only-quote-key";
const quoteService = new QuoteService(
  cartService,
  taxService,
  rulesEpochService,
  paymentMethodThresholdRepo,
  shippingRateRepo,
  userAddressRepo,
  siteSettingRepo,
  quoteSecret,
  couponService,
);
const paymentInstrumentsService = new PaymentInstrumentsService(paymentRepo);
const quoteController = new QuoteController(quoteService, paymentInstrumentsService);

const checkoutService = new CheckoutService(
  cartService,
  taxService,
  shippingService,
  couponService,
  orderCreationService,
  paymentService,
  quoteService,
  orderConfirmationService,
  paymentMethodThresholdRepo,
  shippingRateRepo,
  userAddressRepo,
);
const checkoutController = new CheckoutController(checkoutService, webhookService);

const orderQueryService = new OrderQueryService(orderRepo, orderItemCancellationRepo);
const vendorOrderService = new VendorOrderService(vendorOrderRepo, orderItemCancellationRepo);
const vendorOrderController = new VendorOrderController(vendorOrderService, orderStatusService);
const verifiedPurchaseService = new VerifiedPurchaseService(orderRepo);

const commissionController = new CommissionController(commissionService, payoutService);
const adminPayoutController = new AdminPayoutController(
  payoutService,
  auditLogRepo,
  vendorBankAccountRepo,
  vendorEncryption,
);
const payoutAdjustmentService = new PayoutAdjustmentService(vendorPayoutAdjustmentRepo);
// Constructed after payoutService — CommissionReversalService (C1) needs
// PayoutService.invalidateDraftForReversal to invalidate a draft whose
// claimed commission a reversal is about to release.
const commissionReversalService = new CommissionReversalService(payoutService);
const _payoutWorker = createPayoutWorker(payoutService);

const payoutDraftQueue = getPayoutDraftQueue();
// MINOR (round 4): these registrations are fire-and-forget by design —
// awaiting them would make a momentarily-unreachable Redis fail service
// boot — but a bare floating promise meant a rejection (Redis down at
// boot) left the scheduler silently unregistered, i.e. no payout drafts
// ever generated again, with nothing in the logs. Every one of them now
// reports its own failure.
void schedulePayoutDraftGeneration(payoutDraftQueue).catch((err: unknown) =>
  console.error("[scheduler] failed to register the payout draft generation scheduler", err),
);
const _payoutDraftWorker = createPayoutDraftWorker({ vendorRepo, payoutService });

const shippingProviderRegistry = new ShippingProviderRegistry();
shippingProviderRegistry.register(new MockShippingProviderAdapter());
shippingProviderRegistry.register(new PostaPlusAdapter());

await upsertProvidersFromRegistry(shippingProviderRegistry, shippingProviderRepo);
const shipmentTrackingService = new ShipmentTrackingService(
  shipmentRepo,
  shipmentItemRepo,
  shipmentEventRepo,
  vendorOrderRepo,
  orderItemRepo,
  orderStatusService,
  shipmentStatusHistoryRepo,
  integrationEventsQueue,
  siteSettingRepo,
  warehouseRepo,
  warehouseVendorPermissionRepo,
);
const shipmentTrackingController = new ShipmentTrackingController(shipmentTrackingService);
const refundService = new RefundService(paymentRepo, stripe);
const orderItemCancellationService = new OrderItemCancellationService(
  orderRepo,
  vendorOrderRepo,
  orderItemRepo,
  commissionRepo,
  inventoryRepo,
  inventoryMovementRepo,
  paymentRepo,
  orderItemCancellationRepo,
  refundService,
  orderStatusService,
  orderEventQueue,
  commissionReversalService,
  {
    shipmentRepo,
    registry: shippingProviderRegistry,
    accountRepo: vendorCarrierAccountRepo,
    vendorRepo,
    warehouseRepo,
    encryption,
    userRepo,
  },
);
const adminOrderCancellationService = new AdminOrderCancellationService(
  orderRepo,
  shipmentRepo,
  vendorRepo,
  vendorCarrierAccountRepo,
  orderStatusService,
  shipmentTrackingService,
  refundService,
  shippingProviderRegistry,
  encryption,
  paymentRepo,
  userRepo,
  walletTransactionRepo,
);
const orderController = new OrderController(
  orderQueryService,
  orderStatusService,
  adminOrderCancellationService,
  orderItemCancellationService,
);

const autoShipmentQueue = getAutoShipmentQueue();
const notificationEventsQueue = new Queue("notification-events", {
  connection: { url: config.bullmq.redisUrl },
});
const _orderEventBridge = new BullWorker(
  ORDER_EVENT_QUEUE,
  async (job) => {
    if (job.data?.toStatus === "confirmed" && job.data.vendorOrderId) {
      await autoShipmentQueue.add("auto-shipment", {
        orderId: job.data.orderId,
        vendorOrderId: job.data.vendorOrderId,
        vendorId: job.data.actorId,
      });
    }
    await notificationEventsQueue.add("notification-event", job.data);
  },
  { connection: { url: config.bullmq.redisUrl }, concurrency: 1 },
);

const _autoShipmentWorker = createAutoShipmentWorker(
  vendorRepo,
  vendorOrderRepo,
  vendorCarrierAccountRepo,
  orderStatusService,
  shipmentTrackingService,
  shippingProviderRegistry,
  encryption,
  warehouseRepo,
);

const postaPlusTrackingPollQueue = getPostaPlusTrackingPollQueue();
void schedulePostaPlusTrackingPoll(postaPlusTrackingPollQueue).catch((err: unknown) =>
  console.error("[scheduler] failed to register the PostaPlus tracking poll scheduler", err),
);
const _postaPlusTrackingPollWorker = createPostaPlusTrackingPollWorker(
  shipmentRepo,
  vendorCarrierAccountRepo,
  shippingProviderRegistry,
  encryption,
  shipmentTrackingService,
);

const commissionSettlementQueue = getCommissionSettlementQueue();
void scheduleCommissionSettlement(commissionSettlementQueue).catch((err: unknown) =>
  console.error("[scheduler] failed to register the commission settlement scheduler", err),
);
const _commissionSettlementWorker = createCommissionSettlementWorker(commissionRepo);

const returnService = new ReturnService(
  returnRepo,
  returnItemRepo,
  orderRepo,
  vendorOrderRepo,
  orderItemRepo,
  inventoryRepo,
  inventoryMovementRepo,
  userRepo,
  walletTransactionRepo,
  orderStatusService,
  orderEventQueue,
  refundService,
  commissionReversalService,
);
const returnController = new ReturnController(returnService);

const disputeService = new DisputeService(
  disputeRepo,
  disputeMessageRepo,
  orderRepo,
  vendorOrderRepo,
  userRepo,
  walletTransactionRepo,
  orderStatusService,
  orderEventQueue,
  refundService,
  orderItemRepo,
  commissionReversalService,
);
const disputeController = new DisputeController(disputeService);

const reviewRatingQueue = getReviewRatingQueue();
const reviewService = new ReviewService(
  reviewRepo,
  reviewVoteRepo,
  orderItemRepo,
  productRepo,
  vendorRepo,
  reviewRatingQueue,
);
const reviewController = new ReviewController(reviewService);

const _reviewRatingWorker = createReviewRatingWorker(reviewRepo, productRepo, vendorRepo);

const dashboardService = new DashboardService(
  orderRepo,
  vendorOrderRepo,
  userRepo,
  vendorRepo,
  commissionRepo,
);
const dashboardController = new DashboardController(dashboardService);

const couponAdminService = new CouponAdminService(
  AppDataSource,
  couponRepo,
  couponProductRepo,
  couponCategoryRepo,
  couponVendorRepo,
  couponExcludedProductRepo,
  couponUserRestrictionRepo,
);
const couponAdminController = new CouponController(couponAdminService);

const promotionsService = new PromotionsService(couponAdminService);

const cartAbandonmentService = new CartAbandonmentService();
const cartAbandonmentController = new CartAbandonmentController(cartAbandonmentService);

const cartAbandonmentDetectionQueue = getCartAbandonmentDetectionQueue();
const _cartAbandonmentDetectionWorker =
  createCartAbandonmentDetectionWorker(cartAbandonmentService);
void scheduleCartAbandonmentDetection(cartAbandonmentDetectionQueue).catch((err: unknown) =>
  console.error("[scheduler] failed to register the cart abandonment detection scheduler", err),
);

const cartAbandonmentReminderQueue = getCartAbandonmentReminderQueue();
const _cartAbandonmentReminderWorker = createCartAbandonmentReminderWorker(
  cartAbandonmentService,
  notificationEventsQueue,
);
void scheduleCartAbandonmentReminder(cartAbandonmentReminderQueue).catch((err: unknown) =>
  console.error("[scheduler] failed to register the cart abandonment reminder scheduler", err),
);

const cartAbandonmentPurgeQueue = getCartAbandonmentPurgeQueue();
const _cartAbandonmentPurgeWorker = createCartAbandonmentPurgeWorker(cartAbandonmentService);
void scheduleCartAbandonmentPurge(cartAbandonmentPurgeQueue).catch((err: unknown) =>
  console.error("[scheduler] failed to register the cart abandonment purge scheduler", err),
);

const pendingOrderReaperService = new PendingOrderReaperService(
  orderRepo,
  paymentRepo,
  orderStatusService,
  stripe,
  config.orders.pendingExpiryMinutes,
);
const pendingOrderReaperQueue = getPendingOrderReaperQueue();
const _pendingOrderReaperWorker = createPendingOrderReaperWorker(pendingOrderReaperService);
void schedulePendingOrderReaper(pendingOrderReaperQueue).catch((err: unknown) =>
  console.error("[scheduler] failed to register the pending order reaper scheduler", err),
);

const _invoiceWorker = createInvoiceWorker(invoiceService);

export const container = new Elysia({ name: "order-service-container" })
  .decorate("cartController", cartController)
  .decorate("shippingController", shippingController)
  .decorate("deliveryEstimateService", deliveryEstimateService)
  .decorate("publicHolidayService", publicHolidayService)
  .decorate("warehouseRepo", warehouseRepo)
  .decorate("checkoutController", checkoutController)
  .decorate("orderController", orderController)
  .decorate("vendorOrderController", vendorOrderController)
  .decorate("verifiedPurchaseService", verifiedPurchaseService)
  .decorate("commissionController", commissionController)
  .decorate("shipmentTrackingController", shipmentTrackingController)
  .decorate("returnController", returnController)
  .decorate("disputeController", disputeController)
  .decorate("reviewController", reviewController)
  .decorate("dashboardController", dashboardController)
  .decorate("couponAdminController", couponAdminController)
  .decorate("couponService", couponService)
  .decorate("promotionsService", promotionsService)
  .decorate("cartAbandonmentController", cartAbandonmentController)
  .decorate("adminPayoutController", adminPayoutController)
  .decorate("payoutAdjustmentService", payoutAdjustmentService)
  .decorate("quoteController", quoteController)
  .decorate("paymentMethodThresholdRepo", paymentMethodThresholdRepo)
  .decorate("shippingRateRepo", shippingRateRepo)
  .decorate("shippingContributionTierRepo", shippingContributionTierRepo)
  .decorate("siteSettingRepo", siteSettingRepo)
  .decorate("vendorRepo", vendorRepo)
  .decorate("shippingProviderRepo", shippingProviderRepo)
  .decorate("vendorCarrierAccountRepo", vendorCarrierAccountRepo)
  .decorate("shippingProviderRegistry", shippingProviderRegistry)
  .decorate("encryption", encryption)
  .decorate("vendorOrderRepo", vendorOrderRepo)
  .decorate("shipmentRepo", shipmentRepo)
  .decorate("shipmentEventRepo", shipmentEventRepo)
  .decorate("orderStatusService", orderStatusService)
  .decorate("shipmentTrackingService", shipmentTrackingService)
  .decorate("paymentService", paymentService)
  .decorate("refundService", refundService)
  .decorate("paymentRepo", paymentRepo)
  .decorate("commissionService", commissionService)
  .decorate("invoiceService", invoiceService);
