import { errorHandler, requestLogger } from "@materialhub/plugins";
import { Elysia } from "elysia";
import { availabilityPublicRoutes } from "./domain/availability/availability.routes.ts";
import { adminBookingRoutes } from "./domain/booking/admin-booking.routes.ts";
import { bookingRoutes } from "./domain/booking/booking.routes.ts";
import { internalBookingRoutes } from "./domain/booking/internal-booking.routes.ts";
import { manageBookingRoutes } from "./domain/booking/manage-booking.routes.ts";
import { icalFeedRoutes } from "./domain/calendar/ical-feed.routes.ts";
import { locationPublicRoutes, locationRoutes } from "./domain/location/location.routes.ts";
import { blockTimeRoutes } from "./domain/manage/block-time.routes.ts";
import { calendarFeedUrlRoutes } from "./domain/manage/calendar-feed-url.routes.ts";
import { calendarSubscriptionRoutes } from "./domain/manage/calendar-subscription.routes.ts";
import { manageBookingActionsRoutes } from "./domain/manage/manage-booking-actions.routes.ts";
import { manageCalendarRoutes } from "./domain/manage/manage-calendar.routes.ts";
import { manualBookingRoutes } from "./domain/manage/manual-booking.routes.ts";
import {
  serviceReviewRoutes,
  vendorServiceReviewRoutes,
} from "./domain/reviews/service-review.routes.ts";
import { staffPublicRoutes, staffRoutes } from "./domain/staff/staff.routes.ts";
import { availabilityRuleRoutes } from "./domain/working-hours/availability-rule.routes.ts";

export const app = new Elysia()
  .use(requestLogger)
  .use(errorHandler)
  .get("/health", () => ({
    status: "ok",
    service: "booking-service",
    timestamp: new Date().toISOString(),
  }))
  .use(locationRoutes)
  .use(locationPublicRoutes)
  .use(staffRoutes)
  .use(staffPublicRoutes)
  .use(availabilityRuleRoutes)
  .use(availabilityPublicRoutes)
  .use(internalBookingRoutes)
  .use(manageBookingRoutes)
  .use(manualBookingRoutes)
  .use(blockTimeRoutes)
  .use(manageCalendarRoutes)
  .use(manageBookingActionsRoutes)
  .use(calendarSubscriptionRoutes)
  .use(calendarFeedUrlRoutes)
  .use(icalFeedRoutes)
  .use(adminBookingRoutes)
  .use(bookingRoutes)
  .use(serviceReviewRoutes)
  .use(vendorServiceReviewRoutes);
