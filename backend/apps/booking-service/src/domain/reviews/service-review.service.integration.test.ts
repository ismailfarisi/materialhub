// service-review.service.integration.test.ts
//
// Live Postgres (BOOKING_LIVE_DB=1) — no order-service, no Stripe required
// (unlike cancel's/no-show's live suites): reviews never touch money, only a
// booking/service_reviews/staff_members/vendors read+write. Mirrors
// reminder-scheduler.integration.test.ts's live-gate + "seed booking+engagement
// fixtures directly" shortcut (bypasses BookingService.create's
// hold->availability->pay flow entirely) + cleanup patterns.
//
// Exercises the REAL ServiceReviewService + ServiceReviewRatingService against
// a real Postgres row, covering the brief's exact three cases: review before
// completion -> 403; after completion -> created + ratings updated (staff AND
// vendor); second review -> 409 (the partial unique index,
// uq_service_reviews_booking, backstops the pre-check). A fourth test covers
// the vendor-reply endpoint's happy path + duplicate-reply 409, since it's
// cheap here (no extra fixtures) and the brief names it as in-scope.
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
  AppDataSource,
  Booking,
  BookingStatus,
  DepositType,
  EngagementKind,
  EngagementStatus,
  ServiceOffering,
  ServiceOfferingStatus,
  ServicePaymentMode,
  ServiceReview,
  ServiceReviewStatus,
  StaffEngagement,
  StaffMember,
  User,
  UserRole,
  UserStatus,
  Vendor,
  VendorStatus,
  ensureDatabase,
} from "@materialhub/database";
import type { HttpError } from "@materialhub/plugins";
import { EngagementService } from "../engagement/engagement.service.ts";
import { ServiceReviewRatingService } from "./service-review-rating.service.ts";
import { ServiceReviewService } from "./service-review.service.ts";

const LIVE_DB = process.env.BOOKING_LIVE_DB === "1";
const describeLive = LIVE_DB ? describe : describe.skip;

const HOUR_MS = 3_600_000;
const unique = Date.now();

describeLive("ServiceReviewService (live DB)", () => {
  let vendorId: string;
  let customerId: string;
  let staffId: string;
  let offeringId: string;

  let reviewService: ServiceReviewService;
  let engagementService: EngagementService;

  const bookingRepo = () => AppDataSource.getRepository(Booking);
  const reviewRepo = () => AppDataSource.getRepository(ServiceReview);
  const engagementRepo = () => AppDataSource.getRepository(StaffEngagement);
  const staffRepo = () => AppDataSource.getRepository(StaffMember);
  const vendorRepo = () => AppDataSource.getRepository(Vendor);

  const createdBookingIds: string[] = [];
  const createdEngagementIds: string[] = [];
  const createdReviewIds: string[] = [];
  let slotCursor = 0;

  function nextSlotStartsAt(): Date {
    slotCursor += 1;
    const d = new Date(Date.now() + 10 * 24 * HOUR_MS);
    d.setUTCHours(d.getUTCHours() + slotCursor * 2);
    return d;
  }

  async function seedBooking(status: BookingStatus): Promise<Booking> {
    const startsAt = nextSlotStartsAt();
    const endsAt = new Date(startsAt.getTime() + 30 * 60_000);

    const engagement = await engagementService.reserve({
      staffMemberId: staffId,
      vendorId,
      startsAt,
      endsAt,
      kind: EngagementKind.marketplace_booking,
      status: EngagementStatus.confirmed,
      createdBy: customerId,
    });
    createdEngagementIds.push(engagement.id);

    const booking = await bookingRepo().save(
      bookingRepo().create({
        booking_number: `REV${unique}${slotCursor}`,
        customer_user_id: customerId,
        vendor_id: vendorId,
        staff_member_id: staffId,
        engagement_id: engagement.id,
        service_offering_id: offeringId,
        service_name: "Review Test Service",
        duration_minutes: 30,
        price_fils: 10_000,
        vat_fils: 0,
        deposit_fils: 0,
        deposit_type: DepositType.none,
        cancellation_window_hours: 24,
        reschedule_window_hours: 24,
        commission_rate: 10,
        commission_fils: 1000,
        starts_at: startsAt,
        ends_at: endsAt,
        status,
        source: "marketplace",
        payment_mode: ServicePaymentMode.pay_at_venue,
      }),
    );
    createdBookingIds.push(booking.id);
    return booking;
  }

  beforeAll(async () => {
    await ensureDatabase();

    const userRepo = AppDataSource.getRepository(User);
    const vRepo = AppDataSource.getRepository(Vendor);
    const sRepo = AppDataSource.getRepository(StaffMember);

    const customer = await userRepo.save(
      userRepo.create({
        first_name: "Review",
        last_name: "Customer",
        email: `booking-review-svc-${unique}@test.local`,
        password_hash: "x",
        role: UserRole.customer,
        status: UserStatus.active,
      }),
    );
    customerId = customer.id;

    const vendor = await vRepo.save(
      vRepo.create({
        name: `Review Test Vendor ${unique}`,
        slug: `review-test-vendor-${unique}`,
        business_name: "Review Test Salon",
        business_type: "salon",
        contact_email: `booking-review-vendor-${unique}@test.local`,
        contact_phone: "+971500000006",
        status: VendorStatus.approved,
      }),
    );
    vendorId = vendor.id;

    const staff = await sRepo.save(
      sRepo.create({ vendor_id: vendorId, name: `Review Test Stylist ${unique}` }),
    );
    staffId = staff.id;

    const offeringRepo = AppDataSource.getRepository(ServiceOffering);
    const offering = await offeringRepo.save(
      offeringRepo.create({
        vendor_id: vendorId,
        slug: `review-test-offering-${unique}`,
        name: "Review Test Offering",
        duration_minutes: 30,
        buffer_before_minutes: 0,
        buffer_after_minutes: 0,
        slot_step_minutes: 15,
        min_notice_minutes: 0,
        max_advance_days: 365,
        price_fils: 10_000,
        vat_rate: 5 as unknown as number,
        deposit_type: DepositType.none,
        deposit_value: 0,
        cancellation_window_hours: 24,
        reschedule_window_hours: 24,
        payment_mode: ServicePaymentMode.pay_at_venue,
        status: ServiceOfferingStatus.published,
      }),
    );
    offeringId = offering.id;

    engagementService = new EngagementService(engagementRepo());
    const ratingService = new ServiceReviewRatingService(
      staffRepo(),
      vendorRepo(),
      AppDataSource.query.bind(AppDataSource),
    );
    reviewService = new ServiceReviewService(reviewRepo(), bookingRepo(), ratingService);
  }, 30_000);

  afterAll(async () => {
    async function step(label: string, fn: () => Promise<unknown>): Promise<void> {
      try {
        await fn();
      } catch (err) {
        console.error(`[service-review.integration.test] cleanup step "${label}" failed`, err);
      }
    }

    if (createdReviewIds.length) {
      await step("delete reviews", () =>
        reviewRepo()
          .createQueryBuilder()
          .delete()
          .where("id IN (:...ids)", { ids: createdReviewIds })
          .execute(),
      );
    }
    if (createdBookingIds.length) {
      await step("delete bookings", () =>
        bookingRepo()
          .createQueryBuilder()
          .delete()
          .where("id IN (:...ids)", { ids: createdBookingIds })
          .execute(),
      );
    }
    if (createdEngagementIds.length) {
      await step("delete engagements", () =>
        engagementRepo()
          .createQueryBuilder()
          .delete()
          .where("id IN (:...ids)", { ids: createdEngagementIds })
          .execute(),
      );
    }
    if (staffId) {
      await step("delete staff", () =>
        staffRepo().createQueryBuilder().delete().where("id = :id", { id: staffId }).execute(),
      );
    }
    if (offeringId) {
      await step("delete offering", () =>
        AppDataSource.getRepository(ServiceOffering)
          .createQueryBuilder()
          .delete()
          .where("id = :id", { id: offeringId })
          .execute(),
      );
    }
    if (vendorId) {
      await step("delete vendor", () =>
        vendorRepo().createQueryBuilder().delete().where("id = :id", { id: vendorId }).execute(),
      );
    }
    if (customerId) {
      await step("delete customer", () =>
        AppDataSource.getRepository(User)
          .createQueryBuilder()
          .delete()
          .where("id = :id", { id: customerId })
          .execute(),
      );
    }
  }, 30_000);

  it("review before completion -> 403", async () => {
    const booking = await seedBooking(BookingStatus.confirmed);
    try {
      await reviewService.create(customerId, booking.id, { rating: 5 });
      throw new Error("expected a 403");
    } catch (err) {
      expect((err as HttpError).statusCode).toBe(403);
    }
  });

  it("after completion -> created + staff/vendor ratings updated; second review -> 409", async () => {
    const booking = await seedBooking(BookingStatus.completed);

    const review = await reviewService.create(customerId, booking.id, {
      rating: 5,
      title: "Excellent",
      body: "Would book again",
    });
    createdReviewIds.push(review.id);

    expect(review.booking_id).toBe(booking.id);
    expect(review.vendor_id).toBe(vendorId);
    expect(review.staff_member_id).toBe(staffId);
    expect(review.status).toBe(ServiceReviewStatus.approved);

    const staff = await staffRepo().findOne({ where: { id: staffId } });
    const vendor = await vendorRepo().findOne({ where: { id: vendorId } });
    expect(Number(staff?.rating)).toBe(5);
    expect(staff?.rating_count).toBe(1);
    expect(Number(vendor?.rating_avg)).toBe(5);
    expect(vendor?.rating_count).toBe(1);

    // Second review for the SAME booking -> 409 (partial unique index
    // uq_service_reviews_booking backstops the pre-check).
    try {
      await reviewService.create(customerId, booking.id, { rating: 3 });
      throw new Error("expected a 409");
    } catch (err) {
      expect((err as HttpError).statusCode).toBe(409);
    }
  });

  it("vendor reply: first attempt saves, second attempt -> 409", async () => {
    const booking = await seedBooking(BookingStatus.completed);
    const review = await reviewService.create(customerId, booking.id, { rating: 4 });
    createdReviewIds.push(review.id);

    // Owner/manager-only (Phase 7 review, finding 7) — the vendorMembership
    // permission alone is not enough to speak publicly in the vendor's name.
    const vendorActor = { vendorId, role: "owner" };
    const replied = await reviewService.vendorReply(
      vendorActor,
      review.id,
      "Thank you for visiting!",
    );
    expect(replied.vendor_reply).toBe("Thank you for visiting!");

    try {
      await reviewService.vendorReply(vendorActor, review.id, "Second reply");
      throw new Error("expected a 409");
    } catch (err) {
      expect((err as HttpError).statusCode).toBe(409);
    }
  });
});
