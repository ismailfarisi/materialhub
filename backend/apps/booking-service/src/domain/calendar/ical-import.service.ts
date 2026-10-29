// ical-import.service.ts
//
// Phase 6 Task 4 (spec off-platform capacity — inbound iCal import). Pulls a
// vendor's external calendar (Google / Fresha / etc., a StaffCalendarSubscription
// row's `ical_url`) into the SAME `staff_engagements` capacity ledger every
// other engagement source writes to, so an external booking blocks MaterialHub
// availability like a marketplace booking / walk-in / block does.
//
// ── Two entry points ────────────────────────────────────────────────────────
//   • sync(subscription, feedText, now)  — PURE-ISH: given the already-fetched
//     feed body + an injected `now`, parses + expands recurring events (RRULE,
//     review C1) into per-occurrence entries over the [now−1d, now+90d] window,
//     then diffs them against the subscription's existing engagements and
//     writes the delta. No I/O beyond the ledger repos/EngagementService — no
//     fetch, no Date.now() (the window is anchored on the injected `now`) — so
//     tests drive it directly with fixture text. An unsupported recurrence rule
//     imports the master occurrence only and bumps `unsupportedRecurrence` so
//     poll() can record a partial-success note (still a successful sync).
//   • poll(now, fetchImpl)               — the per-tick orchestrator the BullMQ
//     job calls: loads active subscriptions, fetches each feed via the SSRF-
//     guarded, streaming-capped fetchIcalFeedSafely (see ical-fetch-guard.ts —
//     review fix cycle 1, findings I-1/I-2), and calls sync() per
//     subscription. One bad feed never blocks the others (per-subscription
//     try/catch); a fetch/oversize/non-200/disallowed-URL failure records a
//     SHORT CLASSIFIED `last_sync_error` (never raw error text — that field is
//     echoed verbatim by GET to the vendor, so raw text would be a probing
//     oracle) and leaves engagements + `last_synced_at` untouched.
//
// ── Idempotency (controller-resolved, no unique index on external_ref) ───────
// The key is the triple (staff_member_id, external_source = subscription.id,
// external_ref = event uid). Safe as a find-then-write because the poller runs
// concurrency 1 and per-subscription work is serial. Each sync loads the
// subscription's existing confirmed/conflicted external_import engagements once,
// maps them by uid, and diffs:
//   new uid            -> reserve confirmed (on 23P01 -> insert conflicted + notify)
//   times changed      -> move (on 23P01 -> release + re-insert conflicted + notify)
//   unchanged confirmed-> no write
//   still-conflicted   -> retry promote conflicted->confirmed (guarded 23P01)
//   uid gone from feed -> release (conflicted rows too)
//
// ── Conflict handling (two-customers-one-chair; never skip silently) ─────────
// A `conflicted` row sits OUTSIDE the `no_double_book` EXCLUDE predicate
// (status IN held/confirmed), so it's ALWAYS insertable and availability still
// counts it busy (BUSY_STATUSES). We notify the vendor (vendor_booking_conflict)
// ONLY on the transition INTO conflicted (first insert), never on a failed
// promotion retry — otherwise every 15-min tick would re-spam the same clash.
import {
  EngagementKind,
  EngagementStatus,
  NotificationType,
  type StaffCalendarSubscription,
  type StaffEngagement,
  type StaffMember,
} from "@materialhub/database";
import { ConflictError } from "@materialhub/plugins";
import { In, type Repository } from "typeorm";
import type { EngagementService } from "../engagement/engagement.service.ts";
import { type FetchLike, IcalFetchError, fetchIcalFeedSafely } from "./ical-fetch-guard.ts";
import { IcalLimitExceededError, parseICal } from "./ical-parse.ts";
import { expandRecurringEvents } from "./ical-recurrence.ts";

// Best-effort vendor recipient resolver for the conflict notification — same
// optional-dependency seam cancel.service.ts uses. Unwired -> notification
// simply skipped, sync still succeeds.
export interface VendorOwnerLookup {
  findOwnerUserId(vendorId: string): Promise<string | null>;
}

export interface NotificationEventQueueLike {
  add(name: string, data: unknown): Promise<unknown>;
}

// Minimal fetch seam (global fetch is assignable to this) so poll() is testable
// without hitting the network. Re-exported from ical-fetch-guard.ts (the
// guarded-fetch module owns the type; this file just re-uses it).
export type { FetchLike };

export interface SyncResult {
  inserted: number; // new uid -> confirmed import row
  moved: number; // existing row re-timed to a new slot (move succeeded)
  released: number; // uid gone from feed -> released
  unchanged: number; // confirmed row, same times -> no write
  conflicted: number; // landed/stayed conflicted (transition INTO conflicted)
  promoted: number; // conflicted -> confirmed retry succeeded
  stillConflicted: number; // conflicted row still blocked (no write, no notify)
  notified: number; // vendor_booking_conflict events emitted
  unsupportedRecurrence: number; // recurring events with an unsupported rule (imported master-only)
}

// MaterialHub's OWN outbound feed UID shape (ical-feed.service.ts:
// `engagement-{id}@materialhubuae.com`), optionally carrying the `#{occurrenceStart}`
// suffix a recurrence expansion would add. A vendor who subscribes MaterialHub to
// their external calendar AND re-exports/copies those events back into the feed
// we import would otherwise create a permanent `conflicted` shadow row + a
// vendor_booking_conflict notification for every single MaterialHub booking (alarm
// fatigue), and re-block a freed slot for up to two polling cycles when the
// original is cancelled. We recognize and skip our own UIDs BEFORE diffing
// (review I2). Platforms that copy events preserve the UID per RFC 5545, so the
// direct UID-preserving echo is caught here; the manual-copy-with-fresh-UID
// variant is inherently uncatchable and covered by Phase 7 UI guidance.
const OWN_OUTBOUND_UID = /^engagement-[^@]+@materialhub\.ae(#[^@]*)?$/;

const FETCH_TIMEOUT_MS = 15_000;
// 2 MB cap, enforced incrementally by fetchIcalFeedSafely (byte count of the
// UTF-8 wire bytes as they stream in, NOT text.length / UTF-16 code units —
// see the I-2 note in ical-fetch-guard.ts).
const MAX_FEED_BYTES = 2 * 1024 * 1024;

export class IcalImportService {
  constructor(
    private readonly subscriptionRepo: Repository<StaffCalendarSubscription>,
    private readonly engagementRepo: Repository<StaffEngagement>,
    private readonly engagementService: EngagementService,
    private readonly staffRepo: Repository<StaffMember>,
    private readonly notificationQueue: NotificationEventQueueLike,
    private readonly vendorOwnerLookup?: VendorOwnerLookup,
  ) {}

  // ── Per-tick orchestration (the job supplies now + fetch defaults) ──────────
  async poll(now: Date = new Date(), fetchImpl: FetchLike = fetch): Promise<void> {
    const subscriptions = await this.subscriptionRepo.find({
      where: { is_active: true },
    });
    for (const subscription of subscriptions) {
      try {
        const feedText = await fetchIcalFeedSafely(subscription.ical_url, fetchImpl, {
          timeoutMs: FETCH_TIMEOUT_MS,
          maxBytes: MAX_FEED_BYTES,
        });
        const syncResult = await this.sync(subscription, feedText, now);
        // Partial success: an unsupported recurrence rule imports only the
        // master occurrence but the sync still SUCCEEDS (availability updated
        // for everything else). Surface a short classified note to the vendor
        // via `last_sync_error` while still stamping `last_synced_at` — never a
        // failure, never raw text (review C1).
        const partialNote =
          syncResult.unsupportedRecurrence > 0
            ? `unsupported recurrence rule on ${syncResult.unsupportedRecurrence} event(s) (partially imported)`
            : null;
        await this.subscriptionRepo.update(
          { id: subscription.id },
          { last_synced_at: now, last_sync_error: partialNote },
        );
      } catch (err) {
        // One bad feed must never block the others. Log the FULL error for ops
        // (console only), but only ever persist a SHORT CLASSIFIED reason to
        // `last_sync_error` — that column is echoed verbatim by GET to the
        // vendor, so raw fetch/DNS/network error text (which can contain
        // resolved addresses, connection-refused detail, etc.) would be a
        // probing oracle (review finding I-1). Leave engagements +
        // last_synced_at untouched either way.
        const rawMessage = err instanceof Error ? err.message : String(err);
        console.warn(
          `[ical-import] sync failed for subscription ${subscription.id}: ${rawMessage}`,
        );
        const classified = err instanceof IcalFetchError ? err.classified : "sync failed";
        await this.subscriptionRepo
          .update({ id: subscription.id }, { last_sync_error: classified.slice(0, 500) })
          .catch((updateErr) =>
            console.warn(
              `[ical-import] failed to record last_sync_error for ${subscription.id}`,
              updateErr,
            ),
          );
      }
    }
  }

  // ── PURE-ISH diff+write (no fetch, no Date.now) ─────────────────────────────
  async sync(
    subscription: StaffCalendarSubscription,
    feedText: string,
    now: Date = new Date(),
  ): Promise<SyncResult> {
    const result: SyncResult = {
      inserted: 0,
      moved: 0,
      released: 0,
      unchanged: 0,
      conflicted: 0,
      promoted: 0,
      stillConflicted: 0,
      notified: 0,
      unsupportedRecurrence: 0,
    };

    // Parse never throws — garbage yields fewer/zero events. Then expand
    // recurring masters (RRULE) into per-occurrence entries within the bounded
    // window around the INJECTED `now` (review C1 — no Date.now in the diff
    // path); each occurrence carries its own `{uid}#{start}` external_ref so
    // the diff engine below is unchanged. Dedupe by uid (last-wins) so a feed
    // that repeats a uid doesn't fight itself. Skip MaterialHub's own echoed
    // outbound events (review I2) BEFORE diffing — a debug-only count, never
    // `last_sync_error` noise.
    //
    // Resource limits (review finding 1): the 2 MB body cap does NOT bound the
    // WORK a feed implies — ~19.5k minimal VEVENTs fit in 2 MB, and one
    // `RRULE:FREQ=DAILY` each expands to ~1.8M occurrences (measured), i.e.
    // hundreds of MB of heap in a 384 MB service plus one serial reserve() —
    // INSERT + cache invalidation — per occurrence. parseICal and
    // expandRecurringEvents now enforce hard caps and throw
    // IcalLimitExceededError; convert it to a classified IcalFetchError so
    // poll()'s existing handler records a vendor-readable `last_sync_error` and
    // leaves engagements + last_synced_at untouched. Failing the whole sync is
    // deliberate: a truncated import would RELEASE every engagement whose uid
    // fell past the cut (see the removals loop below), silently freeing real
    // busy time and re-selling booked slots.
    let expansion: ReturnType<typeof expandRecurringEvents>;
    try {
      expansion = expandRecurringEvents(parseICal(feedText), { now });
    } catch (err) {
      if (err instanceof IcalLimitExceededError) {
        throw new IcalFetchError("feed too large: too many events or recurring occurrences");
      }
      throw err;
    }
    result.unsupportedRecurrence = expansion.unsupportedCount;
    const parsedByUid = new Map<string, (typeof expansion.events)[number]>();
    let skippedEcho = 0;
    for (const ev of expansion.events) {
      if (OWN_OUTBOUND_UID.test(ev.uid)) {
        skippedEcho++;
        continue;
      }
      parsedByUid.set(ev.uid, ev);
    }
    if (skippedEcho > 0) {
      console.debug(
        `[ical-import] skipped ${skippedEcho} echoed MaterialHub event(s) for subscription ${subscription.id}`,
      );
    }

    // Existing ledger rows owned by THIS subscription (external_source = its id),
    // keyed by uid (external_ref). Defensive: release any duplicate-uid extras.
    const existing = await this.engagementRepo.find({
      where: {
        external_source: subscription.id,
        kind: EngagementKind.external_import,
        status: In([EngagementStatus.confirmed, EngagementStatus.conflicted]),
      },
    });
    const existingByUid = new Map<string, StaffEngagement>();
    for (const row of existing) {
      const uid = row.external_ref ?? "";
      if (!uid) continue;
      const prior = existingByUid.get(uid);
      if (prior) {
        // Two rows for the same uid — keep the first, free the extra.
        await this.engagementService.release(row.id);
        result.released++;
        continue;
      }
      existingByUid.set(uid, row);
    }

    // ── Additions / updates ──
    for (const [uid, ev] of parsedByUid) {
      const row = existingByUid.get(uid);
      if (!row) {
        await this.importNew(subscription, ev, result);
        continue;
      }

      const sameTimes =
        new Date(row.starts_at).getTime() === ev.startsAt.getTime() &&
        new Date(row.ends_at).getTime() === ev.endsAt.getTime();

      if (row.status === EngagementStatus.confirmed) {
        if (sameTimes) {
          result.unchanged++;
          continue;
        }
        await this.moveOrConflict(subscription, row, ev, result);
        continue;
      }

      // row.status === conflicted
      if (sameTimes) {
        await this.retryPromotion(row, result);
      } else {
        // The conflicting event moved — re-evaluate from scratch at the new
        // time (release the stale conflicted row, re-import). move() can't be
        // used here: the row is OUTSIDE the EXCLUDE predicate, so moving it
        // wouldn't re-check the constraint for a promotion.
        await this.engagementService.release(row.id);
        await this.importNew(subscription, ev, result);
      }
    }

    // ── Removals: any existing uid no longer in the feed is released. ──
    for (const [uid, row] of existingByUid) {
      if (!parsedByUid.has(uid)) {
        await this.engagementService.release(row.id);
        result.released++;
      }
    }

    return result;
  }

  // New uid -> try to reserve a confirmed import row; on overlap land it
  // conflicted + notify (transition INTO conflicted).
  private async importNew(
    subscription: StaffCalendarSubscription,
    ev: ReturnType<typeof parseICal>[number],
    result: SyncResult,
  ): Promise<void> {
    try {
      await this.engagementService.reserve({
        staffMemberId: subscription.staff_member_id,
        vendorId: subscription.vendor_id,
        startsAt: ev.startsAt,
        endsAt: ev.endsAt,
        kind: EngagementKind.external_import,
        status: EngagementStatus.confirmed,
        externalSource: subscription.id,
        externalRef: ev.uid,
      });
      result.inserted++;
    } catch (err) {
      if (!(err instanceof ConflictError)) throw err;
      await this.landConflicted(subscription, ev, result);
    }
  }

  // Confirmed row whose feed times changed -> move it; if the new slot overlaps
  // another engagement, free the old slot and land the event conflicted at its
  // new time + notify.
  private async moveOrConflict(
    subscription: StaffCalendarSubscription,
    row: StaffEngagement,
    ev: ReturnType<typeof parseICal>[number],
    result: SyncResult,
  ): Promise<void> {
    try {
      await this.engagementService.move({
        engagementId: row.id,
        staffMemberId: subscription.staff_member_id,
        startsAt: ev.startsAt,
        endsAt: ev.endsAt,
      });
      result.moved++;
    } catch (err) {
      if (!(err instanceof ConflictError)) throw err;
      // Old slot no longer reflects the feed — free it, then land conflicted.
      await this.engagementService.release(row.id);
      await this.landConflicted(subscription, ev, result);
    }
  }

  // Insert the event as a `conflicted` row (always insertable — outside the
  // EXCLUDE predicate) and emit the one-time vendor notification.
  private async landConflicted(
    subscription: StaffCalendarSubscription,
    ev: ReturnType<typeof parseICal>[number],
    result: SyncResult,
  ): Promise<void> {
    await this.engagementService.reserve({
      staffMemberId: subscription.staff_member_id,
      vendorId: subscription.vendor_id,
      startsAt: ev.startsAt,
      endsAt: ev.endsAt,
      kind: EngagementKind.external_import,
      status: EngagementStatus.conflicted,
      externalSource: subscription.id,
      externalRef: ev.uid,
    });
    result.conflicted++;
    const notified = await this.notifyConflict(subscription, ev);
    if (notified) result.notified++;
  }

  // Still-present conflicted row -> retry promoting it to confirmed. The status
  // UPDATE re-enters the EXCLUDE predicate, so it 23P01s if the slot is still
  // taken; catch and keep it conflicted (NO notification — anti-spam).
  private async retryPromotion(row: StaffEngagement, result: SyncResult): Promise<void> {
    try {
      await this.engagementService.confirm(row.id);
      result.promoted++;
    } catch (err) {
      if ((err as { code?: string })?.code === "23P01") {
        result.stillConflicted++;
        return;
      }
      throw err;
    }
  }

  // ── Conflict notification (EXACT 7 flat string variables the template
  // renders) — best-effort, never fails the sync. ────────────────────────────
  private async notifyConflict(
    subscription: StaffCalendarSubscription,
    ev: ReturnType<typeof parseICal>[number],
  ): Promise<boolean> {
    if (!this.vendorOwnerLookup) return false;
    try {
      const vendorUserId = await this.vendorOwnerLookup.findOwnerUserId(subscription.vendor_id);
      if (!vendorUserId) return false;

      const staff = await this.staffRepo.findOne({
        where: { id: subscription.staff_member_id },
      });
      const blocker = await this.findBlockingEngagement(subscription.staff_member_id, ev);

      const variables = {
        staff_name: staff?.name ?? "Staff member",
        existing_summary: blocker ? summarizeEngagementKind(blocker.kind) : "Existing engagement",
        existing_starts_at: blocker
          ? new Date(blocker.starts_at).toISOString()
          : ev.startsAt.toISOString(),
        existing_ends_at: blocker
          ? new Date(blocker.ends_at).toISOString()
          : ev.endsAt.toISOString(),
        conflicting_summary: ev.summary || "External calendar event",
        conflicting_starts_at: ev.startsAt.toISOString(),
        conflicting_ends_at: ev.endsAt.toISOString(),
      };
      const data = {
        subscriptionId: subscription.id,
        vendorId: subscription.vendor_id,
        staffMemberId: subscription.staff_member_id,
        eventUid: ev.uid,
        conflictingStartsAt: ev.startsAt.toISOString(),
        conflictingEndsAt: ev.endsAt.toISOString(),
      };

      await this.notificationQueue.add("notification-event", {
        userId: vendorUserId,
        notificationType: NotificationType.vendor_booking_conflict,
        variables,
        data,
      });
      return true;
    } catch (err) {
      console.warn(
        `[ical-import] failed to emit vendor_booking_conflict for subscription ${subscription.id}`,
        err,
      );
      return false;
    }
  }

  // The held/confirmed engagement that blocks the imported event's slot (the
  // "existing" side of the clash). First overlapping row by start time.
  private async findBlockingEngagement(
    staffMemberId: string,
    ev: ReturnType<typeof parseICal>[number],
  ): Promise<StaffEngagement | null> {
    return this.engagementRepo
      .createQueryBuilder("e")
      .where("e.staff_member_id = :staffMemberId", { staffMemberId })
      .andWhere("e.status IN (:...statuses)", {
        statuses: [EngagementStatus.held, EngagementStatus.confirmed],
      })
      .andWhere("e.starts_at < :end AND e.ends_at > :start", {
        start: ev.startsAt,
        end: ev.endsAt,
      })
      .orderBy("e.starts_at", "ASC")
      .getOne();
  }
}

// Human-readable label for the "existing" (blocking) engagement in the conflict
// notification, keyed by its kind.
function summarizeEngagementKind(kind: EngagementKind): string {
  switch (kind) {
    case EngagementKind.marketplace_booking:
      return "MaterialHub booking";
    case EngagementKind.walk_in:
      return "Walk-in";
    case EngagementKind.phone:
      return "Phone booking";
    case EngagementKind.manual_block:
      return "Block";
    case EngagementKind.break:
      return "Break";
    case EngagementKind.external_import:
      return "External calendar event";
    default:
      return "Existing engagement";
  }
}
