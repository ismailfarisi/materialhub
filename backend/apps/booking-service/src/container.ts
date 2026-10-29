import { config } from "@materialhub/config";
import {
  AppDataSource,
  Booking,
  BookingStatusHistory,
  Category,
  LocationMembership,
  Payment,
  ServiceArea,
  ServiceOffering,
  ServiceReview,
  SiteSetting,
  StaffCalendarSubscription,
  StaffEngagement,
  StaffLocation,
  StaffMember,
  StaffService as StaffServiceEntity,
  StaffTimeOff,
  StaffWorkingHours,
  User,
  Vendor,
  VendorHoliday,
  VendorLocation,
  VendorMember,
  VendorMemberRole,
  VendorMemberStatus,
} from "@materialhub/database";
import { Elysia } from "elysia";
import { AvailabilityCache } from "./domain/availability/availability-cache.ts";
import { AvailabilityController } from "./domain/availability/availability.controller.ts";
import { AvailabilityService } from "./domain/availability/availability.service.ts";
import { createBookingAuthWorker, getBookingAuthQueue } from "./domain/booking/booking-auth.job.ts";
import { BookingAuthService } from "./domain/booking/booking-auth.service.ts";
import {
  createBookingAutoCompleteWorker,
  getBookingAutoCompleteQueue,
} from "./domain/booking/booking-autocomplete.job.ts";
import { BookingAutoCompleteService } from "./domain/booking/booking-autocomplete.service.ts";
import { BookingCompletionService } from "./domain/booking/booking-completion.service.ts";
import { BookingHoldService } from "./domain/booking/booking-hold.service.ts";
import { BookingPaymentClient } from "./domain/booking/booking-payment.client.ts";
import { BookingQueryService } from "./domain/booking/booking-query.service.ts";
import {
  createBookingReaperWorker,
  getBookingReaperQueue,
  scheduleBookingReaper,
} from "./domain/booking/booking-reaper.job.ts";
import { BookingReaperService } from "./domain/booking/booking-reaper.service.ts";
import type {
  BookingAuthHook,
  BookingAutoCompleteHook,
  BookingReminderHook,
} from "./domain/booking/booking-status.service.ts";
import { BookingStatusService } from "./domain/booking/booking-status.service.ts";
import { BookingController } from "./domain/booking/booking.controller.ts";
import { BookingService } from "./domain/booking/booking.service.ts";
import { CancelService } from "./domain/booking/cancel.service.ts";
import { NoShowService } from "./domain/booking/no-show.service.ts";
import { RescheduleService, type VendorOwnerLookup } from "./domain/booking/reschedule.service.ts";
import { StrikeService } from "./domain/booking/strike.service.ts";
import { IcalFeedService } from "./domain/calendar/ical-feed.service.ts";
import {
  createIcalImportWorker,
  getIcalImportQueue,
  scheduleIcalImport,
} from "./domain/calendar/ical-import.job.ts";
import { IcalImportService } from "./domain/calendar/ical-import.service.ts";
import { EngagementService } from "./domain/engagement/engagement.service.ts";
import { LocationController } from "./domain/location/location.controller.ts";
import { LocationService } from "./domain/location/location.service.ts";
import { BlockTimeController } from "./domain/manage/block-time.controller.ts";
import { BlockTimeService } from "./domain/manage/block-time.service.ts";
import { CalendarFeedUrlController } from "./domain/manage/calendar-feed-url.controller.ts";
import { CalendarFeedUrlService } from "./domain/manage/calendar-feed-url.service.ts";
import { CalendarSubscriptionController } from "./domain/manage/calendar-subscription.controller.ts";
import { CalendarSubscriptionService } from "./domain/manage/calendar-subscription.service.ts";
import { LocationMembershipController } from "./domain/manage/location-membership.controller.ts";
import { LocationMembershipService } from "./domain/manage/location-membership.service.ts";
import { ManageBookingActionsController } from "./domain/manage/manage-booking-actions.controller.ts";
import { ManageCalendarController } from "./domain/manage/manage-calendar.controller.ts";
import { ManageCalendarService } from "./domain/manage/manage-calendar.service.ts";
import { ManualBookingController } from "./domain/manage/manual-booking.controller.ts";
import { ManualBookingService } from "./domain/manage/manual-booking.service.ts";
import {
  createBookingReminderWorker,
  getBookingReminderQueue,
  getNotificationEventsQueue,
} from "./domain/reminders/booking-reminder.job.ts";
import { ReminderScheduler } from "./domain/reminders/reminder-scheduler.ts";
import { ServiceReviewRatingService } from "./domain/reviews/service-review-rating.service.ts";
import { ServiceReviewController } from "./domain/reviews/service-review.controller.ts";
import { ServiceReviewService } from "./domain/reviews/service-review.service.ts";
import { OfferingStaffController } from "./domain/staff/offering-staff.controller.ts";
import { StaffController } from "./domain/staff/staff.controller.ts";
import { StaffService } from "./domain/staff/staff.service.ts";
import { AvailabilityRuleController } from "./domain/working-hours/availability-rule.controller.ts";
import { AvailabilityRuleService } from "./domain/working-hours/availability-rule.service.ts";
import type { LocationScopeRepos } from "./guards/location-scope.ts";

// Shared location-scope repos for assertLocationManager.
const locationScope: LocationScopeRepos = {
  locationRepo: AppDataSource.getRepository(VendorLocation),
  membershipRepo: AppDataSource.getRepository(LocationMembership),
};

// ─── Location + service areas ──────────────────────────────────────────
const locationService = new LocationService(
  AppDataSource.getRepository(VendorLocation),
  AppDataSource.getRepository(ServiceArea),
);
const locationController = new LocationController(locationService);

// ─── Staff + eligibility links ─────────────────────────────────────────
// Fix-cycle-1 finding I-3 — StaffService also takes the vendor-location and
// offering repos now, for getLinkedLocations/getLinkedServices. Both entities
// are cheap `AppDataSource.getRepository(...)` calls already used elsewhere
// in this file (VendorLocation above for locationScope; ServiceOffering
// below for offeringRepo) — getRepository is idempotent/cheap to call again,
// not a new connection or duplicate registration.
const staffService = new StaffService(
  AppDataSource.getRepository(StaffMember),
  AppDataSource.getRepository(StaffLocation),
  AppDataSource.getRepository(StaffServiceEntity),
  AppDataSource.getRepository(VendorLocation),
  AppDataSource.getRepository(ServiceOffering),
);
const staffController = new StaffController(staffService, locationScope);

// ─── Availability read-model (shared cache) ────────────────────────────
// One AvailabilityCache instance is shared by the read side (AvailabilityService)
// and the write-side invalidators (rule/time-off + engagement mutators).
const availabilityCache = new AvailabilityCache();

// ─── Working hours + time-off ──────────────────────────────────────────
const availabilityRuleService = new AvailabilityRuleService(
  AppDataSource.getRepository(StaffWorkingHours),
  AppDataSource.getRepository(StaffTimeOff),
  AppDataSource.getRepository(StaffMember),
  availabilityCache,
  // Sizes the cache-invalidation horizon to the vendor's real max_advance_days
  // (getRepository is idempotent/cheap — same instance as `offeringRepo` below).
  AppDataSource.getRepository(ServiceOffering),
);
const availabilityRuleController = new AvailabilityRuleController(availabilityRuleService);

// ─── Availability engine (read side) ───────────────────────────────────
const offeringRepo = AppDataSource.getRepository(ServiceOffering);
const availabilityService = new AvailabilityService(
  offeringRepo,
  AppDataSource.getRepository(StaffMember),
  AppDataSource.getRepository(StaffWorkingHours),
  AppDataSource.getRepository(StaffTimeOff),
  AppDataSource.getRepository(StaffEngagement),
  AppDataSource.getRepository(VendorLocation),
  AppDataSource.getRepository(VendorHoliday),
  AppDataSource.getRepository(ServiceArea),
  availabilityCache,
);
const availabilityController = new AvailabilityController(availabilityService, offeringRepo);

// ─── Public offering staff (Task 0A, Phase 7 backend prerequisite) — GET
// /booking/offerings/:id/staff. Reuses offeringRepo (above) for the
// published-only visibility gate and staffService (above) for
// listEligible() — the SAME eligibility source AvailabilityService and the
// vendor-facing /vendor/booking/staff/eligible route already use. See
// offering-staff.controller.ts's header comment for the full rationale. ───
const offeringStaffController = new OfferingStaffController(offeringRepo, staffService);

// ─── Booking lifecycle (Task 6 state machine; Task 3 wires order-service's
// webhook -> /internal/bookings/*/confirm|payment-failed to this) + Task 7b's
// prepay off-session-auth job (booking-auth.service.ts/.job.ts). ───────────
const bookingRepo = AppDataSource.getRepository(Booking);
const paymentRepo = AppDataSource.getRepository(Payment);
const bookingPaymentClient = new BookingPaymentClient();

// BookingStatusService and BookingAuthService reference each other:
// BookingStatusService.confirm()/handlePaymentFailed()/the cancelled|expired
// transition path call OUT to BookingAuthService (schedule/notify/remove);
// BookingAuthService's follow-up-cancel job calls BACK into
// BookingStatusService.transition() (as a StatusTransitioner) to actually
// cancel the booking. Neither file imports the other's concrete class (see
// the BookingAuthHook/StatusTransitioner interfaces in each) to avoid a
// module-level circular import, but constructing the two objects is still a
// value-level cycle — broken here with a late-binding hook: the closures
// below only dereference `bookingAuthService` when actually CALLED, by which
// point its `const` initializer a few lines down has already run (a closure
// may reference a `const` declared later in the same scope as long as it
// isn't invoked before that point — standard JS/TS temporal-dead-zone
// behavior, not a forward-reference error).
const bookingAuthHook: BookingAuthHook = {
  scheduleForConfirm: (booking) => bookingAuthService.scheduleForConfirm(booking),
  handleAsyncAuthFailure: (booking, reason) =>
    bookingAuthService.handleAsyncAuthFailure(booking, reason),
  removeBookingAuthJob: (bookingId) => bookingAuthService.removeBookingAuthJob(bookingId),
};

// ─── Booking auto-complete (Phase 5 Task 5b, spec §5.3 "Auto-complete") —
// scheduled at CONFIRM time for EVERY confirmed booking (not just prepay) via
// BookingStatusService's enqueuePostConfirmHooks seam, fires
// completeBooking() at `ends_at + config.bookings.autoCompleteGraceHours` if
// the booking is still confirmed by then (already triggers Task 9's capture +
// commission accrual). Same value-level cycle as bookingAuthHook/
// bookingAuthService above (BookingStatusService calls OUT via
// autoCompleteHook on confirm/cancel/expire/reschedule; BookingAutoComplete
// Service's delayed job calls BACK into BookingStatusService.completeBooking())
// — broken the same way with a late-binding hook. ──────────────────────────
const autoCompleteHook: BookingAutoCompleteHook = {
  scheduleForConfirm: (booking) => bookingAutoCompleteService.scheduleForConfirm(booking),
  removeAutoCompleteJob: (bookingId) => bookingAutoCompleteService.removeAutoCompleteJob(bookingId),
};

// ─── Booking reminders (Phase 5 Task 6, plan "Reminders (delayed BullMQ)") —
// two delayed jobs (T-24h, T-1h before starts_at) scheduled at CONFIRM time
// for EVERY confirmed booking via the same enqueuePostConfirmHooks seam
// autoCompleteHook uses. No value-level cycle here (unlike bookingAuthHook/
// autoCompleteHook above): ReminderScheduler never calls back into
// BookingStatusService — a fired reminder job only reads the booking and
// emits a notification event, it never transitions status — so it can be
// constructed directly, ahead of bookingStatusService, with no late-binding
// hook needed. reminderHook is still expressed as the same narrow-interface
// shape as the other two hooks for consistency with
// booking-status.service.ts's BookingReminderHook seam. ────────────────────
const vendorRepo = AppDataSource.getRepository(Vendor);
const reminderQueue = getBookingReminderQueue();
const notificationEventsQueue = getNotificationEventsQueue();
const reminderScheduler = new ReminderScheduler(
  bookingRepo,
  reminderQueue,
  notificationEventsQueue,
  vendorRepo,
  locationScope.locationRepo,
);
const reminderHook: BookingReminderHook = {
  scheduleForConfirm: (booking) => reminderScheduler.scheduleForConfirm(booking),
  removeReminderJobs: (bookingId) => reminderScheduler.removeReminderJobs(bookingId),
};
const _bookingReminderWorker = createBookingReminderWorker(reminderScheduler);

// ─── Vendor owner lookup (Phase 5 Tasks 3/4/8) — the notifiable vendor user
// (owner, else any active member) for every vendor-facing booking
// notification: reschedule's/cancel's own vendor_booking_* notify (below) and
// Task 8's confirm-time vendor_new_booking notify (BookingStatusService).
// Constructed here (ahead of bookingCompletionService/bookingStatusService,
// pulled up from its original spot near reschedule/cancel below) since it has
// no value-level cycle with anything — just a read-only vendorMemberRepo
// query — so nothing stops BookingStatusService itself from taking it as a
// constructor dependency the way bookingAuthHook/autoCompleteHook/reminderHook
// already do. ────────────────────────────────────────────────────────────
const vendorMemberRepo = AppDataSource.getRepository(VendorMember);
const vendorOwnerLookup: VendorOwnerLookup = {
  // Best-effort notifiable vendor user for vendor-facing notifications —
  // prefer an active owner, else any active member with a user.
  async findOwnerUserId(vendorId: string): Promise<string | null> {
    const member = await vendorMemberRepo
      .createQueryBuilder("m")
      .where("m.vendor_id = :vendorId", { vendorId })
      .andWhere("m.status = :status", { status: VendorMemberStatus.active })
      .andWhere("m.user_id IS NOT NULL")
      .orderBy("CASE WHEN m.role = :owner THEN 0 ELSE 1 END", "ASC")
      .setParameter("owner", VendorMemberRole.owner)
      .getOne();
    return member?.user_id ?? null;
  },
};

// ─── Booking completion (Task 9, spec §5.2 step 3 / §5.3 "On completed") —
// captures the prepay authorization + accrues commission via order-service's
// /internal/booking-payments/complete, then (Task 8) best-effort emits
// booking_completed/booking_review_request to the customer. No value-level
// cycle here (unlike bookingAuthHook/bookingAuthService above):
// BookingCompletionService only needs paymentRepo + bookingPaymentClient +
// the shared notificationEventsQueue, all already constructed. ────────────
const bookingCompletionService = new BookingCompletionService(
  paymentRepo,
  bookingPaymentClient,
  notificationEventsQueue,
);

const bookingStatusService = new BookingStatusService(
  bookingRepo,
  availabilityCache,
  bookingAuthHook,
  bookingCompletionService,
  autoCompleteHook,
  reminderHook,
  // Task 8: confirm-time booking_confirmed (customer) + vendor_new_booking
  // (vendor owner) notifications.
  notificationEventsQueue,
  vendorOwnerLookup,
);

const bookingAuthQueue = getBookingAuthQueue();
const bookingAuthService: BookingAuthService = new BookingAuthService(
  bookingRepo,
  paymentRepo,
  bookingPaymentClient,
  bookingStatusService,
  bookingAuthQueue,
  // Task 8: the `booking_payment_failed` notification (pay-now link).
  notificationEventsQueue,
  config.bookings.appUrl,
);
const _bookingAuthWorker = createBookingAuthWorker(bookingAuthService);

const bookingAutoCompleteQueue = getBookingAutoCompleteQueue();
const bookingAutoCompleteService: BookingAutoCompleteService = new BookingAutoCompleteService(
  bookingRepo,
  bookingStatusService,
  bookingAutoCompleteQueue,
  config.bookings.autoCompleteGraceHours,
);
const _bookingAutoCompleteWorker = createBookingAutoCompleteWorker(bookingAutoCompleteService);

// ─── Pending-booking reaper (Task 7) — expires abandoned pending_payment
// bookings past config.bookings.pendingExpiryMinutes via
// BookingStatusService.transition (frees the slot + writes history), then
// best-effort voids any outstanding deposit PaymentIntent through
// order-service. Wired as a BullMQ repeatable job the same way order-service
// wires PendingOrderReaperService in its container.ts. ─────────────────────
const bookingReaperService = new BookingReaperService(
  bookingRepo,
  paymentRepo,
  bookingStatusService,
  bookingPaymentClient,
  config.bookings.pendingExpiryMinutes,
);
const bookingReaperQueue = getBookingReaperQueue();
const _bookingReaperWorker = createBookingReaperWorker(bookingReaperService);
scheduleBookingReaper(bookingReaperQueue);

// ─── Customer booking APIs (Task 8, spec §5.1/§8) — hold/create/read-own.
// BookingHoldService lazily connects its own Redis client in production (see
// that file's constructor comment) rather than sharing AvailabilityCache's
// connection, matching how booking-hold.service.ts is designed to be used
// standalone. BookingService.hold()/create() reuse checkPayAtVenueAllowed
// (the Phase 5 strike-gate seam) for both the hold response's
// allowed_payment_modes and create()'s 422 backstop. ─────────────────────
const bookingHoldService = new BookingHoldService();
// ─── No-show strikes (Phase 5 Task 5, spec §5.3) — the DERIVED per-vendor /
// platform-wide no_show count gate. Injected into BookingService so its
// checkPayAtVenueAllowed seam (create()'s 422 backstop + hold()'s
// allowed_payment_modes) enforces the real revocation instead of always
// allowing. Counts are re-derived live on every gate — no stored counter. ─────
const strikeService = new StrikeService(
  bookingRepo,
  config.bookings.noShowVendorStrikeThreshold,
  config.bookings.noShowPlatformStrikeThreshold,
);
const bookingService = new BookingService(
  offeringRepo,
  bookingRepo,
  AppDataSource.getRepository(ServiceArea),
  AppDataSource.getRepository(User),
  AppDataSource.getRepository(Vendor),
  AppDataSource.getRepository(Category),
  AppDataSource.getRepository(SiteSetting),
  availabilityService,
  bookingHoldService,
  bookingPaymentClient,
  availabilityCache,
  strikeService,
  // Phase 5 final review Fix 1: hand BookingService the fully-wired status
  // service so its pay_at_venue immediate-confirm fires the same post-confirm
  // hooks (auto-complete + reminders + booking_confirmed/vendor_new_booking)
  // a deposit/prepay webhook confirm gets — instead of the bare, hook-less
  // instance it used to construct internally.
  bookingStatusService,
);
const bookingQueryService = new BookingQueryService(bookingRepo);
const bookingStatusHistoryRepo = AppDataSource.getRepository(BookingStatusHistory);

// ─── Reschedule (Phase 5 Task 3, spec §5.3) — moves a confirmed booking to a
// new slot: transactional engagement slot_range UPDATE (EXCLUDE -> 409),
// confirmed->rescheduled->confirmed audit transitions, and re-times all three
// delayed jobs (reminders / prepay-auth / auto-complete) for the new slot via
// the reschedule* helpers those services expose. Payment carries over
// unchanged (no order-service call). Reuses the fully-wired bookingStatusService
// (so its transition cleanup fires the stale-job removals) plus the same
// availability engine + hold service create() uses, and the shared
// vendorOwnerLookup constructed above (ahead of bookingStatusService). ─────
const rescheduleService = new RescheduleService(
  bookingRepo,
  offeringRepo,
  AppDataSource.getRepository(ServiceArea),
  availabilityService,
  bookingHoldService,
  bookingStatusService,
  reminderScheduler,
  bookingAutoCompleteService,
  bookingAuthService,
  notificationEventsQueue,
  availabilityCache,
  vendorOwnerLookup,
);

// ─── Cancel (Phase 5 Task 4, spec §5.3) — cancels a confirmed booking: frees
// the slot + removes all three delayed jobs via the fully-wired
// bookingStatusService's `cancelled` transition cleanup, then best-effort moves
// money per the snapshotted policy (void an authorized prepay hold in-window /
// partial-capture the forfeit out-of-window / refund a deposit) through
// order-service's booking-payment endpoints. Reuses the same vendorOwnerLookup
// the reschedule flow uses for the vendor-facing notification. ───────────────
const cancelService = new CancelService(
  bookingRepo,
  paymentRepo,
  bookingStatusService,
  bookingPaymentClient,
  notificationEventsQueue,
  vendorOwnerLookup,
);

// ─── No-show (Phase 5 Task 5, spec §5.3) — a vendor/admin marks a confirmed
// booking (in the [starts_at, ends_at+grace) window) as a no-show: forfeits per
// the snapshotted policy (best-effort partial-capture/void/keep-deposit through
// order-service), records the forfeit in the status-history reason, and notifies
// the customer with the penalty breakdown + a dispute/support deep link. The
// no_show transition leaves the engagement untouched (the slot's time has
// already passed). Reuses the same fully-wired bookingStatusService, paymentRepo,
// payment client, notification queue, grace hours (for the window's upper bound),
// and appUrl (for the dispute link) the other Phase 5 flows use. ───────────────
const noShowService = new NoShowService(
  bookingRepo,
  paymentRepo,
  bookingStatusService,
  bookingPaymentClient,
  notificationEventsQueue,
  config.bookings.autoCompleteGraceHours,
  config.bookings.appUrl,
);

const bookingController = new BookingController(
  bookingService,
  bookingQueryService,
  rescheduleService,
  cancelService,
  noShowService,
);

// ─── Booking-gated reviews (Phase 5 Task 7, spec §4.3/§7) — a customer
// reviews a completed booking; a vendor may reply once. Ratings recompute
// (staff_member.rating + a blended vendor.rating_avg — see
// service-review-rating.service.ts's doc for why it's blended with the
// product-catalog `reviews` table rather than a naive service_reviews-only
// aggregate) runs synchronously in ServiceReviewService.create via the
// ServiceReviewRatingRecomputer seam, using AppDataSource.query directly for
// the raw AVG/UNION aggregates (same shared-Postgres precedent
// commission-snapshot.service.ts uses for cross-domain reads). ─────────────
const serviceReviewRepo = AppDataSource.getRepository(ServiceReview);
const serviceReviewRatingService = new ServiceReviewRatingService(
  AppDataSource.getRepository(StaffMember),
  vendorRepo,
  AppDataSource.query.bind(AppDataSource),
);
const serviceReviewService = new ServiceReviewService(
  serviceReviewRepo,
  bookingRepo,
  serviceReviewRatingService,
);
const serviceReviewController = new ServiceReviewController(serviceReviewService);

// ─── Manual walk-in / phone booking (Phase 6 Task 1) — capacity-only, no
// commission/payment wiring (see manual-booking.service.ts's header comment).
// Reuses offeringRepo/bookingRepo/availabilityCache/locationScope already
// constructed above; StaffMember/StaffLocation repos are fetched fresh
// (TypeORM's DataSource caches repositories internally, same as
// serviceReviewRatingService's AppDataSource.getRepository(StaffMember) call
// just above). ───────────────────────────────────────────────────────────
const manualBookingService = new ManualBookingService(
  AppDataSource.getRepository(StaffMember),
  AppDataSource.getRepository(StaffLocation),
  offeringRepo,
  bookingRepo,
  availabilityCache,
);
const manualBookingController = new ManualBookingController(manualBookingService, locationScope);

// ─── Block time / break (Phase 6 Task 2) — vendor-side manual_block/break
// engagements on the same capacity ledger, engagement-only (see
// block-time.service.ts's header comment). Reuses the StaffMember/
// StaffLocation repos + availabilityCache + locationScope already
// constructed above (same reuse precedent as manualBookingService just
// above it). ─────────────────────────────────────────────────────────────
const blockTimeService = new BlockTimeService(
  AppDataSource.getRepository(StaffMember),
  AppDataSource.getRepository(StaffLocation),
  AppDataSource.getRepository(StaffEngagement),
  locationScope,
  availabilityCache,
);
const blockTimeController = new BlockTimeController(blockTimeService, locationScope);

// ─── Vendor calendar (Task 0A, Phase 7 backend prerequisite) — GET
// /manage/calendar. Unified read across ALL staff_engagements kinds
// (unlike blockTimeService.list's manual_block/break-only scope), joined
// with a booking summary (bookings.engagement_id match + a batched
// users-table name lookup for marketplace bookings). Reuses the StaffEngagement
// repo (fetched fresh — TypeORM caches repositories internally, same
// precedent as manualBookingService/blockTimeService above), bookingRepo +
// locationScope already constructed above, plus a fresh User repo for the
// batched customer-name resolution. ─────────────────────────────────────────
const manageCalendarService = new ManageCalendarService(
  AppDataSource.getRepository(StaffEngagement),
  bookingRepo,
  AppDataSource.getRepository(User),
  locationScope,
);
const manageCalendarController = new ManageCalendarController(manageCalendarService);

// ─── Vendor booking mutations + location-membership CRUD (Task 0B, Phase 7) —
// the vendor/location-manager surface the recon flagged as missing: complete/
// no-show/reschedule (authorization in front, DELEGATES to the SAME
// bookingStatusService.completeBooking / noShowService / rescheduleService the
// admin routes + auto-complete job use — zero new money logic) and
// location_memberships CRUD (owner/manager-only grant/list/revoke). Reuses
// bookingRepo + locationScope + the three services already constructed above,
// plus vendorMemberRepo (for the "grant is a subset of vendor membership"
// check) and a fresh User repo (batched display-name/email resolution). ──────
const manageBookingActionsController = new ManageBookingActionsController(
  bookingRepo,
  locationScope,
  bookingStatusService,
  noShowService,
  rescheduleService,
);
const locationMembershipService = new LocationMembershipService(
  locationScope.locationRepo,
  locationScope.membershipRepo,
  vendorMemberRepo,
  AppDataSource.getRepository(User),
);
const locationMembershipController = new LocationMembershipController(locationMembershipService);

// ─── Calendar subscription CRUD + inbound iCal import (Phase 6 Task 4) —
// vendors register an external calendar (Google/Fresha/…) as an iCal URL
// against a staff member; a repeatable poller pulls its events into the same
// capacity ledger as external_import engagements (conflicts land `conflicted`
// + notify the vendor). Reuses the StaffMember/StaffLocation/StaffEngagement
// repos + availabilityCache + locationScope already constructed above, plus
// the shared notificationEventsQueue + vendorOwnerLookup the Phase 5 notify
// flows use. ───────────────────────────────────────────────────────────────
const staffCalendarSubscriptionRepo = AppDataSource.getRepository(StaffCalendarSubscription);
const staffEngagementRepo = AppDataSource.getRepository(StaffEngagement);
const calendarSubscriptionService = new CalendarSubscriptionService(
  AppDataSource.getRepository(StaffMember),
  AppDataSource.getRepository(StaffLocation),
  staffCalendarSubscriptionRepo,
  staffEngagementRepo,
  locationScope,
  availabilityCache,
);
const calendarSubscriptionController = new CalendarSubscriptionController(
  calendarSubscriptionService,
);

// EngagementService instance (with cache) shared by the import poller — the
// same write primitive block-time/manual-booking construct inline, here held
// as a named const since both the poller service needs it.
const importEngagementService = new EngagementService(staffEngagementRepo, availabilityCache);
const icalImportService = new IcalImportService(
  staffCalendarSubscriptionRepo,
  staffEngagementRepo,
  importEngagementService,
  AppDataSource.getRepository(StaffMember),
  notificationEventsQueue,
  vendorOwnerLookup,
);
const icalImportQueue = getIcalImportQueue();
const _icalImportWorker = createIcalImportWorker(icalImportService);
scheduleIcalImport(icalImportQueue);

// ─── Outbound iCal feed + feed-URL issuance (Phase 6 Task 5) — the reverse
// direction of Task 4: a vendor's OTHER platform subscribes to a MaterialHub
// `.ics` URL for one staff member (ical-feed.routes.ts, public/token-signed,
// registered in app.ts below), and a location manager (re)issues that URL
// from the /manage surface (calendar-feed-url.routes.ts). Reuses
// staffEngagementRepo (Task 4, above) for the feed content and the
// StaffMember/StaffLocation repos + locationScope already constructed above
// for the issuance endpoint's staff->linked-locations authorization (same
// shape as calendarSubscriptionService's). config.bookings.icalFeedSecret /
// config.urls.publicApi are the two new config knobs this task adds — see
// libs/config/src/index.ts. ─────────────────────────────────────────────────
const icalFeedService = new IcalFeedService(staffEngagementRepo);
const calendarFeedUrlService = new CalendarFeedUrlService(
  AppDataSource.getRepository(StaffMember),
  AppDataSource.getRepository(StaffLocation),
  locationScope,
  config.bookings.icalFeedSecret,
  config.urls.publicApi,
);
const calendarFeedUrlController = new CalendarFeedUrlController(calendarFeedUrlService);

// DI container for booking-service. Domain controllers are decorated here and
// read off the context by route modules. Grows as domains land (Task 8).
export const container = new Elysia({ name: "booking-service-container" })
  .decorate("locationController", locationController)
  .decorate("staffController", staffController)
  .decorate("offeringStaffController", offeringStaffController)
  .decorate("availabilityRuleController", availabilityRuleController)
  .decorate("availabilityController", availabilityController)
  .decorate("bookingStatusService", bookingStatusService)
  .decorate("bookingController", bookingController)
  .decorate("serviceReviewController", serviceReviewController)
  .decorate("manualBookingController", manualBookingController)
  .decorate("blockTimeController", blockTimeController)
  .decorate("manageCalendarController", manageCalendarController)
  .decorate("manageBookingActionsController", manageBookingActionsController)
  .decorate("locationMembershipController", locationMembershipController)
  .decorate("calendarSubscriptionController", calendarSubscriptionController)
  .decorate("icalFeedService", icalFeedService)
  .decorate("calendarFeedUrlController", calendarFeedUrlController)
  .decorate("bookingQueryService", bookingQueryService)
  .decorate("bookingStatusHistoryRepo", bookingStatusHistoryRepo);
