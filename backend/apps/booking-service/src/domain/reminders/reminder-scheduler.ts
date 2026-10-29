// reminder-scheduler.ts
//
// Phase 5 Task 6 (plan: "Reminders (delayed BullMQ)") — two delayed BullMQ
// jobs scheduled at CONFIRM time for EVERY confirmed booking: T-24h and T-1h
// before `starts_at`. Wiring mirrors booking-autocomplete.service.ts's shape
// closely (delayed jobs with deterministic jobIds, remove/re-time helpers, a
// narrow DI seam back into BookingStatusService via the BookingReminderHook
// interface it defines, to avoid a circular import) — see that file's own
// header comment for the general pattern this follows.
import type { Booking } from "@materialhub/database";
import { BookingStatus, NotificationType } from "@materialhub/database";
import { buildBookingReminderIcs } from "../calendar/ical-feed.ts";

const HOUR_MS = 3_600_000;

export interface ReminderOffset {
  /** Job-id / payload label — also what a fired job reports back as `offset`. */
  label: "24h" | "1h";
  hours: number;
}

// spec/plan: T-24h and T-1h before starts_at. Order matters only for
// readability — scheduleForConfirm schedules both independently.
export const REMINDER_OFFSETS: readonly ReminderOffset[] = [
  { label: "24h", hours: 24 },
  { label: "1h", hours: 1 },
];

/**
 * Pure — no `Date.now()` here; the caller stamps "now" at the edge
 * (scheduleForConfirm), per the established Phase 4/5 convention
 * (computeAutoCompleteFireTime, computeFollowUpFireTime, ...).
 */
export function computeReminderFireTime(startsAt: Date, offsetHours: number): Date {
  return new Date(startsAt.getTime() - offsetHours * HOUR_MS);
}

// ─── DI seams ───────────────────────────────────────────────────────────

export interface ReminderQueueLike {
  add(
    name: string,
    data: unknown,
    opts?: {
      jobId?: string;
      delay?: number;
      removeOnComplete?: number | boolean;
      removeOnFail?: number | boolean;
    },
  ): Promise<unknown>;
  remove(jobId: string): Promise<unknown>;
}

export interface NotificationEventQueueLike {
  add(name: string, data: unknown, opts?: { jobId?: string }): Promise<unknown>;
}

export interface BookingRepoLike {
  findOne(opts: { where: { id: string } }): Promise<Booking | null>;
}

// Narrow lookups (not TypeORM Repository imports) so this file never needs
// the concrete Vendor/VendorLocation entity classes — mirrors
// BookingAutoCompleteService's BookingRepoLike. Both are OPTIONAL: a missing
// lookup just means the notification-event payload's vendor/location display
// fields fall back to null — best-effort enrichment, never a reason to skip
// or fail the reminder itself.
export interface VendorLookup {
  findOne(opts: { where: { id: string } }): Promise<{ business_name?: string | null } | null>;
}

export interface VendorLocationLookup {
  findOne(opts: { where: { id: string } }): Promise<{
    name?: string | null;
    address?: Record<string, unknown> | null;
  } | null>;
}

// jobId naming: the plan's `reminder:{bookingId}:{offset}` trips the
// installed bullmq version's "Custom Id cannot contain :" validation (same
// constraint documented in booking-auth.service.ts / booking-autocomplete
// .service.ts) — `_` is the established separator on this branch.
//
// ── Why the jobId is SLOT-VERSIONED (Phase 7 review, findings 3 + 4) ────────
// The id carries a token derived from the booking's `starts_at`, so a job
// scheduled for one slot can never collide with a job scheduled for another.
// That single change closes two races the previous stable-id scheme had:
//
//  (3) BookingStatusService fires `removeReminderJobs(bookingId)` UN-awaited
//      on the confirmed -> rescheduled transition, while the reschedule flow
//      awaits `rescheduleReminderJobs`. With stable ids the late remove could
//      land AFTER the re-add and delete the fresh jobs, leaving the booking
//      with ZERO reminders. With slot-versioned ids the stale remove can only
//      target the OLD slot's ids (it removes a snapshot taken synchronously
//      at call time — see removeReminderJobs), so it is physically unable to
//      touch the new slot's jobs no matter when it lands.
//
//  (4) `queue.add` with an ALREADY-EXISTING jobId is a SILENT no-op on
//      BullMQ. So a swallowed `queue.remove` failure used to pin the reminder
//      to the OLD fire time (booking moved Fri->Mon, reminder still fires
//      Friday) with nothing downstream to catch it. A new slot means a new
//      id, so the re-add ALWAYS lands; and any surviving old-slot job is
//      rejected at delivery time by runReminderJob's `expectedStartsAt`
//      fingerprint check.
//
// Jobs enqueued by the PREVIOUS (unversioned) code are still removed by
// removeReminderJobs via legacyReminderJobId, and are still safe if they
// survive: they carry no `expectedStartsAt`, so they fall back to the plain
// status check exactly as before.
function slotToken(startsAt: Date): string {
  return startsAt.getTime().toString(36);
}

function reminderJobId(bookingId: string, offsetLabel: string, startsAt: Date): string {
  return `reminder_${bookingId}_${offsetLabel}_${slotToken(startsAt)}`;
}

/** Pre-slot-versioning id shape — removal-only, for jobs already in Redis. */
function legacyReminderJobId(bookingId: string, offsetLabel: string): string {
  return `reminder_${bookingId}_${offsetLabel}`;
}

/**
 * Stable dedupe id for the cross-service notification event (finding 5).
 * Keyed on (booking, offset, slot) so the SAME reminder re-emitted by a
 * retried/replayed BullMQ job collapses to one delivery, while a genuinely
 * re-scheduled booking (new slot) is a genuinely new reminder. Same
 * `_`-separated shape as the job ids above — BullMQ rejects `:` in custom
 * ids, so this doubles as the notification job's own jobId.
 */
export function reminderEventId(bookingId: string, offsetLabel: string, startsAt: Date): string {
  return `booking-reminder_${bookingId}_${offsetLabel}_${slotToken(startsAt)}`;
}

/**
 * The reminder scheduling + fire-time logic (Phase 5 Task 6). Entry points
 * wired into this from BookingStatusService (via the BookingReminderHook
 * interface it defines):
 *
 *   - `scheduleForConfirm` — called from `confirm()`'s `enqueuePostConfirmHooks`
 *     seam, for EVERY confirmed booking. Enqueues up to two delayed
 *     `reminder_{bookingId}_{offset}` jobs (T-24h, T-1h before `starts_at`).
 *   - Cleanup — `removeReminderJobs` is called from `transitionGuarded`'s
 *     cancelled/expired/rescheduled cleanup branch, same as
 *     removeAutoCompleteJob/removeBookingAuthJob — a booking that's no
 *     longer confirmed (or moved off its old slot) must never leave a
 *     dangling reminder job behind.
 *   - `rescheduleReminderJobs` — exposed for Task 3 (reschedule): once a
 *     booking's `starts_at` changes, the flow driving that MUST call this
 *     with the booking's NEW `starts_at` (the cleanup branch above only
 *     REMOVES the stale jobs on the `rescheduled` transition; it does not
 *     know the new slot to re-schedule for). No caller yet on this branch
 *     (Task 3 doesn't exist) — same "seam with no caller yet" situation
 *     BookingAutoCompleteService.rescheduleAutoCompleteJob documents.
 *
 * The BullMQ Worker (booking-reminder.job.ts) that actually processes the
 * `reminder_{id}_{offset}` job delegates straight to `runReminderJob` below.
 */
export class ReminderScheduler {
  constructor(
    private readonly bookingRepo: BookingRepoLike,
    private readonly queue: ReminderQueueLike,
    private readonly notificationQueue: NotificationEventQueueLike,
    private readonly vendorRepo?: VendorLookup,
    private readonly locationRepo?: VendorLocationLookup,
  ) {}

  /**
   * bookingId -> the jobIds currently scheduled for it. `removeReminderJobs`
   * has only a bookingId to go on (that is the signature BookingStatusService
   * calls), but a slot-versioned jobId can't be reconstructed from a
   * bookingId alone — so the ids are recorded here as they are added.
   *
   * Deliberately in-memory and deliberately NOT authoritative: after a
   * process restart this map is empty, removal degrades to the legacy ids
   * only, and a surviving delayed job is instead rejected at DELIVERY time by
   * runReminderJob's status + `expectedStartsAt` guards. Those guards are the
   * correctness boundary; removal is an optimisation on top of them.
   */
  private readonly scheduledJobIds = new Map<string, Set<string>>();

  private rememberJobId(bookingId: string, jobId: string): void {
    const ids = this.scheduledJobIds.get(bookingId);
    if (ids) ids.add(jobId);
    else this.scheduledJobIds.set(bookingId, new Set([jobId]));
  }

  /**
   * Schedules both offsets independently. Per the brief: if a reminder time
   * is already in the past AT CONFIRM (booking made <24h or <1h ahead), that
   * offset is SKIPPED — never scheduled with a negative/zero delay (which
   * would otherwise fire it immediately, as a mistimed "reminder" for a slot
   * the customer just booked seconds ago).
   *
   * Phase 6: a manual walk-in/phone booking (1782390000000) has no
   * `customer_user_id` — there's no one to remind. In practice this path is
   * unreachable for one today (ManualBookingService writes `confirmed`
   * directly and never calls BookingStatusService.postConfirm, the only
   * caller of scheduleForConfirm), but this guard makes that safe rather than
   * assumed if a future caller ever confirms a booking through the normal
   * state machine.
   */
  async scheduleForConfirm(booking: Booking, now: Date = new Date()): Promise<void> {
    if (!booking.customer_user_id) return;
    for (const offset of REMINDER_OFFSETS) {
      const fireAt = computeReminderFireTime(booking.starts_at, offset.hours);
      if (fireAt.getTime() <= now.getTime()) {
        continue;
      }
      const delay = fireAt.getTime() - now.getTime();
      const jobId = reminderJobId(booking.id, offset.label, booking.starts_at);
      this.rememberJobId(booking.id, jobId);
      await this.queue.add(
        "send-reminder",
        {
          bookingId: booking.id,
          offset: offset.label,
          // Slot fingerprint. runReminderJob re-reads the booking at fire
          // time and refuses to deliver if `starts_at` no longer matches —
          // so a job that outlived its slot (a remove that failed, a job
          // already locked/active, a restart that lost the id registry) can
          // never send a reminder for a time the booking no longer has.
          expectedStartsAt: booking.starts_at.toISOString(),
        },
        {
          jobId,
          delay,
          removeOnComplete: 500,
          removeOnFail: 500,
        },
      );
    }
  }

  /**
   * Re-times both jobs for a booking whose `starts_at` has changed
   * (reschedule flow, Task 3). Removes the old-slot jobs (best-effort — fine
   * if none existed, e.g. the original booking was made <1h out and both
   * offsets were skipped) and re-schedules fresh against the booking's
   * CURRENT `starts_at` (correctly re-applying the same past-offset skip
   * logic for the new time).
   *
   * Historically the fragile step here was the re-add: `queue.add` with an
   * already-existing jobId is a SILENT no-op on BullMQ, so if the remove
   * above failed the booking stayed pinned to its OLD reminder time. That is
   * no longer possible — the new slot produces a NEW jobId (see
   * reminderJobId), so the add always lands, and any old-slot job that
   * survived is refused at delivery time by the `expectedStartsAt` check.
   */
  async rescheduleReminderJobs(booking: Booking, now: Date = new Date()): Promise<void> {
    await this.removeReminderJobs(booking.id);
    await this.scheduleForConfirm(booking, now);
  }

  /** Called defensively from BookingStatusService's cancelled/expired/
   * rescheduled transition path so a booking that's no longer confirmed (or
   * moved off its old slot) never leaves a dangling reminder job behind.
   *
   * The set of ids to remove is snapshotted SYNCHRONOUSLY, before this
   * method's first `await` — so an un-awaited call (BookingStatusService
   * fires this without awaiting on the rescheduled transition) can only ever
   * delete the jobs that existed at the moment it was CALLED, however late
   * its Redis round-trips actually land. Jobs added afterwards by a
   * concurrent re-schedule are not in the snapshot and survive. */
  async removeReminderJobs(bookingId: string): Promise<void> {
    const tracked = this.scheduledJobIds.get(bookingId);
    this.scheduledJobIds.delete(bookingId);
    const targets = new Set<string>(tracked ?? []);
    // Also sweep the pre-slot-versioning ids, for jobs enqueued by an older
    // deploy (or by this process before a restart cleared `scheduledJobIds`).
    for (const offset of REMINDER_OFFSETS) {
      targets.add(legacyReminderJobId(bookingId, offset.label));
    }

    for (const jobId of targets) {
      await this.removeJobBestEffort(jobId);
    }
  }

  /** Returns whether the removal actually succeeded. Failure is logged, never
   * thrown — but it is no longer silent-and-inconsequential either: callers
   * that re-schedule do so under a NEW jobId, so a failed removal cannot pin
   * a booking to a stale fire time. */
  private async removeJobBestEffort(jobId: string): Promise<boolean> {
    try {
      await this.queue.remove(jobId);
      return true;
    } catch (err) {
      console.warn(
        `[reminder-scheduler] failed to remove job ${jobId} — a surviving job is neutralised at delivery time by the expectedStartsAt guard`,
        err,
      );
      return false;
    }
  }

  /**
   * BullMQ Worker entry point for the delayed `reminder_{bookingId}_{offset}`
   * job. Fetches the booking fresh (a delayed job's in-flight data can be
   * stale by the time it fires) and treats "no longer confirmed" as a
   * graceful no-op — NOT a failure/retry — mirroring
   * BookingAutoCompleteService.runAutoCompleteJob: a cancelled/rescheduled/
   * completed/no_show booking simply shouldn't get a reminder, and that's
   * the expected outcome whenever this fires after the booking moved on.
   *
   * Notification delivery: pushes ONE event onto the shared "notification-
   * events" BullMQ queue (see booking-reminder.job.ts's
   * getNotificationEventsQueue) — the SAME cross-service mechanism
   * order-service/product-service already use (a plain `{userId,
   * notificationType, variables, data}` job named "notification-event",
   * picked up by notification-service's event-consumer.job.ts generic
   * `event.userId && event.notificationType` branch and forwarded to its
   * SES-email/FCM-push/in-app dispatch queue). Task 8 owns the actual
   * booking_reminder email/push template — this only emits the event with a
   * complete payload (see the `variables`/`data` shape below).
   */
  async runReminderJob(
    bookingId: string,
    offsetLabel: string,
    expectedStartsAt?: string,
  ): Promise<void> {
    const booking = await this.bookingRepo.findOne({ where: { id: bookingId } });
    if (!booking) {
      console.warn(
        `[reminder-scheduler] booking ${bookingId} not found — skipping ${offsetLabel} reminder`,
      );
      return;
    }
    if (booking.status !== BookingStatus.confirmed) {
      console.log(
        `[reminder-scheduler] booking ${bookingId} is ${booking.status} (not confirmed) — skipping ${offsetLabel} reminder`,
      );
      return;
    }
    // Slot-staleness guard (Phase 7 review, finding 4). The status check above
    // is NOT sufficient for a RESCHEDULED booking: reschedule ends with the
    // booking back at `confirmed`, so a reminder job left over from the old
    // slot would sail straight through it and tell the customer their booking
    // is "in 1 hour" for a time that no longer exists. Comparing the slot the
    // job was scheduled FOR against the booking's current `starts_at` closes
    // that regardless of whether the old job was ever successfully removed.
    // Absent on jobs enqueued before slot-versioning — those keep the old
    // status-only behaviour rather than being dropped.
    if (expectedStartsAt && booking.starts_at.toISOString() !== expectedStartsAt) {
      console.log(
        `[reminder-scheduler] booking ${bookingId} moved from ${expectedStartsAt} to ${booking.starts_at.toISOString()} — skipping stale ${offsetLabel} reminder`,
      );
      return;
    }

    const [vendor, location] = await Promise.all([
      this.lookupVendor(booking.vendor_id),
      booking.location_id ? this.lookupLocation(booking.location_id) : Promise.resolve(null),
    ]);

    const vendorName = vendor?.business_name ?? null;
    const locationName = location?.name ?? null;
    const isHomeVisit = !booking.location_id;
    const icsLocation = locationName ?? (isHomeVisit ? "Customer address (home visit)" : "");

    // Structured fields for Task 8's `.ics` attachment/download link, plus
    // the rendered text itself (buildBookingReminderIcs, from Phase 6's
    // domain/calendar/ical-feed.ts — this reminders module absorbed the old
    // Phase 5 ical-vevent.ts helper into that shared module). The
    // current notification-dispatch pipeline
    // (notification-service/services/email-dispatcher.ts's
    // `EmailDispatcher.send(to, subject, html)`) has no attachment
    // parameter today, so this task stops at shaping/rendering the data
    // Task 8 needs rather than wiring an actual email attachment — that's
    // Task 8's job per the brief.
    const icsText = buildBookingReminderIcs({
      uid: `booking-${booking.id}@materialhubuae.com`,
      summary: booking.service_name,
      description: `Booking ${booking.booking_number}${vendorName ? ` at ${vendorName}` : ""}`,
      location: icsLocation || undefined,
      startsAt: booking.starts_at,
      endsAt: booking.ends_at,
    });

    // Idempotency (Phase 7 review, finding 5). This enqueue is the LAST
    // statement of the job, and the reminder queue runs with `attempts: 3`
    // (booking-reminder.job.ts) — so a worker crash or a stalled lock AFTER
    // the enqueue but BEFORE the ack re-runs the whole job and would
    // otherwise send the customer a second email/push. `eventId` is a stable
    // (booking, offset, slot) key: it is passed as the notification job's own
    // BullMQ jobId (an add with an existing jobId is a no-op — the same
    // gotcha that bites elsewhere in this file, used deliberately here) AND
    // carried in the payload so notification-service's consumer can dedupe
    // its downstream dispatch on it too (event-consumer.job.ts), matching the
    // event_id dedupe the Slack support relay uses.
    const eventId = reminderEventId(booking.id, offsetLabel, booking.starts_at);

    await this.notificationQueue.add(
      "notification-event",
      {
        eventId,
        userId: booking.customer_user_id,
        notificationType: NotificationType.booking_reminder,
        variables: {
          service_name: booking.service_name,
          booking_number: booking.booking_number,
          starts_at: booking.starts_at.toISOString(),
          offset: offsetLabel,
          vendor_name: vendorName ?? "",
          location_name: locationName ?? "",
        },
        // Phase 7 review, finding 6: this blob is PERSISTED — notification-
        // service's dispatcher writes it verbatim to `notifications.data`
        // (NotificationDispatcherService.dispatch -> NotificationService.send
        // -> repo.save), and also ships it to FCM and the Redis SSE publish.
        // So it carries only what the reminder templates/deep-link actually
        // need. Dropped: `customerAddress` (the customer's full home address
        // as raw jsonb — a home-visit booking's most sensitive field, and no
        // template reads it; templates.ts's booking_reminder render uses
        // `variables` plus `data.ics.text` only) and `customerUserId`
        // (redundant — `userId` above is the same value, and the row is
        // already user-scoped).
        data: {
          bookingId: booking.id,
          bookingNumber: booking.booking_number,
          offset: offsetLabel,
          eventId,
          vendorId: booking.vendor_id,
          vendorName,
          locationId: booking.location_id,
          locationName,
          locationAddress: location?.address ?? null,
          serviceName: booking.service_name,
          startsAt: booking.starts_at.toISOString(),
          endsAt: booking.ends_at.toISOString(),
          durationMinutes: booking.duration_minutes,
          ics: {
            uid: `booking-${booking.id}@materialhubuae.com`,
            summary: booking.service_name,
            location: icsLocation,
            description: `Booking ${booking.booking_number}${vendorName ? ` at ${vendorName}` : ""}`,
            dtstart: booking.starts_at.toISOString(),
            dtend: booking.ends_at.toISOString(),
            text: icsText,
          },
        },
      },
      { jobId: eventId },
    );
  }

  private async lookupVendor(vendorId: string): Promise<{ business_name?: string | null } | null> {
    if (!this.vendorRepo) return null;
    try {
      return await this.vendorRepo.findOne({ where: { id: vendorId } });
    } catch (err) {
      console.warn(`[reminder-scheduler] vendor lookup failed for ${vendorId}`, err);
      return null;
    }
  }

  private async lookupLocation(
    locationId: string,
  ): Promise<{ name?: string | null; address?: Record<string, unknown> | null } | null> {
    if (!this.locationRepo) return null;
    try {
      return await this.locationRepo.findOne({ where: { id: locationId } });
    } catch (err) {
      console.warn(`[reminder-scheduler] location lookup failed for ${locationId}`, err);
      return null;
    }
  }
}
