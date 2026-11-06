import { errorHandler, requestLogger } from "@materialhub/plugins";
import { Elysia } from "elysia";
import { adminPayoutAdjustmentRoutes } from "./routes/admin-payout-adjustment.routes.ts";
import { adminPayoutRoutes } from "./routes/admin-payout.routes.ts";
import { cartAbandonmentRoutes } from "./routes/cart-abandonment.routes.ts";
import { cartRoutes } from "./routes/cart.routes.ts";
import { checkoutRoutes } from "./routes/checkout.routes.ts";
import { commissionRoutes } from "./routes/commission.routes.ts";
import { couponRoutes } from "./routes/coupon.routes.ts";
import { dashboardRoutes } from "./routes/dashboard.routes.ts";
import {
  deliveryEstimateRoutes,
  publicHolidayAdminRoutes,
  vendorWarehouseDeliveryRoutes,
} from "./routes/delivery-estimate.routes.ts";
import { disputeRoutes } from "./routes/dispute.routes.ts";
import { internalOrderRoutes } from "./routes/internal-order.routes.ts";
import { internalShipmentsRoutes } from "./routes/internal-shipments.routes.ts";
import { internalVendorOrdersRoutes } from "./routes/internal-vendor-orders.routes.ts";
import { orderRoutes } from "./routes/order.routes.ts";
import { paymentMethodAdminRoutes } from "./routes/payment-method-admin.routes.ts";
import { promotionsRoutes } from "./routes/promotions.routes.ts";
import { quoteRequestRoutes } from "./routes/quote-request.routes.ts";
import { returnRoutes } from "./routes/return.routes.ts";
import { reviewRoutes } from "./routes/review.routes.ts";
import { shipmentTrackingRoutes } from "./routes/shipment-tracking.routes.ts";
import { shippingContributionAdminRoutes } from "./routes/shipping-contribution-admin.routes.ts";
import { shippingProviderAdminRoutes } from "./routes/shipping-provider-admin.routes.ts";
import { shippingRateAdminRoutes } from "./routes/shipping-rate-admin.routes.ts";
import { shippingWebhookRoutes } from "./routes/shipping-webhook.routes.ts";
import { shippingRoutes, vendorWarehouseRoutes } from "./routes/shipping.routes.ts";
import { vendorOrderRoutes } from "./routes/vendor-order.routes.ts";
import { vendorShippingIntegrationsRoutes } from "./routes/vendor-shipping-integrations.routes.ts";
import { webhookRoutes } from "./routes/webhook.routes.ts";

export const app = new Elysia()
  .use(requestLogger)
  .use(errorHandler)
  .use(cartRoutes)
  .use(orderRoutes)
  .use(internalOrderRoutes)
  .use(internalVendorOrdersRoutes)
  .use(internalShipmentsRoutes)
  .use(checkoutRoutes)
  .use(webhookRoutes)
  .use(deliveryEstimateRoutes)
  .use(shippingRoutes)
  .use(vendorWarehouseDeliveryRoutes)
  .use(vendorWarehouseRoutes)
  .use(commissionRoutes)
  .use(adminPayoutRoutes)
  .use(adminPayoutAdjustmentRoutes)
  .use(vendorOrderRoutes)
  .use(shipmentTrackingRoutes)
  .use(returnRoutes)
  .use(disputeRoutes)
  .use(reviewRoutes)
  .use(dashboardRoutes)
  .use(couponRoutes)
  .use(promotionsRoutes)
  .use(cartAbandonmentRoutes)
  .use(paymentMethodAdminRoutes)
  .use(shippingRateAdminRoutes)
  .use(publicHolidayAdminRoutes)
  .use(shippingContributionAdminRoutes)
  .use(shippingProviderAdminRoutes)
  .use(vendorShippingIntegrationsRoutes)
  .use(shippingWebhookRoutes)
  .use(quoteRequestRoutes);
