export type BookingActionKey = "complete" | "cancel" | "no_show";

// Mirrors ALLOWED_TRANSITIONS in
// backend/apps/booking-service/src/domain/booking/booking-status.service.ts.
// Terminal states (completed, cancelled, no_show, expired) have no outgoing
// edges by design, so they expose no actions.
//
// ONLY `confirmed` has outgoing admin edges. Verified against the backend:
//   ALLOWED_TRANSITIONS[pending_payment] = {confirmed, expired}  -- no cancel
//   ALLOWED_TRANSITIONS[rescheduled]     = {confirmed}           -- no actions
// and both CancelService (cancel.service.ts:167) and NoShowService
// (no-show.service.ts:142) hard-gate on `status === confirmed`, throwing a
// 422 InvalidBookingTransitionError otherwise. A pending_payment booking is
// expired by the reaper, never cancelled by an admin.
//
// This client gate must never be STRICTER than the server's — if the backend
// later widens a transition, widen it here too rather than leaving the UI
// dead-ending on an action the server would accept.
const ACTIONS_BY_STATUS: Record<string, BookingActionKey[]> = {
  confirmed: ["complete", "cancel", "no_show"],
};

export function availableActions(status: string): BookingActionKey[] {
  return ACTIONS_BY_STATUS[status] ?? [];
}
