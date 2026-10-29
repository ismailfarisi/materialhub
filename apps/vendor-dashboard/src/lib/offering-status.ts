import type { OfferingStatus } from "@/lib/queries/offerings";

// PATCH /vendor/services/:id accepts only the four vendor-settable statuses
// (draft/published/paused/archived — the DTO's OfferingStatus union), and the
// server now enforces one real transition rule: an untrusted vendor asking to
// publish is rewritten to `pending_review` instead, with `rejection_reason`
// cleared. See ServiceOfferingService.update in
// backend/apps/product-service/src/domain/service-offering/service-offering.service.ts.
//
// Everything else here is still a UI-only convenience so the list/edit screens
// offer sensible next steps — it is NOT a mirror of an enforced state machine.
// That is why `rejected` resubmits via next: "published" rather than naming
// `pending_review` directly, which the DTO would reject.
export interface OfferingStatusAction {
	next: OfferingStatus;
	label: string;
	description: string;
	// Past-tense outcome for the success toast. Explicit because the label
	// doesn't inflect ("Publish" -> "publishd", "Submit for review" ->
	// "submit for reviewd") and because publishing an untrusted vendor's
	// offering does NOT result in it being published.
	done: string;
}

// The two publish affordances below are the only ones whose outcome depends on
// the vendor's trust state. Their copy is filled in by getOfferingStatusActions
// from the server's `publish_requires_review`, never re-derived here — see the
// header note above. PUBLISH_PLACEHOLDER marks the entries to substitute.
const PUBLISH_PLACEHOLDER: OfferingStatusAction = {
	next: "published",
	label: "Publish",
	description: "This service becomes bookable on the storefront immediately.",
	done: "is now live on the storefront",
};

const PUBLISH_NEEDS_REVIEW: OfferingStatusAction = {
	next: "published",
	label: "Submit for review",
	// `next` stays "published" — the DTO's OfferingStatus union rejects
	// pending_review, and the server rewrites the status for us.
	description:
		"The MaterialHub team reviews your first service before it goes live. You'll see the outcome here, with a reason if it isn't approved.",
	done: "has been sent for review",
};

const OFFERING_STATUS_ACTIONS: Record<OfferingStatus, OfferingStatusAction[]> = {
	draft: [PUBLISH_PLACEHOLDER],
	paused: [
		PUBLISH_PLACEHOLDER,
		{
			next: "archived",
			label: "Archive",
			description: "Archived services are hidden everywhere and can't be booked.",
			done: "has been archived",
		},
	],
	published: [
		{
			next: "paused",
			label: "Pause",
			description:
				"Paused services stop accepting new bookings but stay visible for editing.",
			done: "is paused and no longer accepting bookings",
		},
		{
			next: "archived",
			label: "Archive",
			description: "Archived services are hidden everywhere and can't be booked.",
			done: "has been archived",
		},
	],
	archived: [
		{
			next: "draft",
			label: "Restore to draft",
			description: "This brings the service back as an editable draft.",
			done: "is back as an editable draft",
		},
	],
	// Awaiting admin review — the vendor has no action but to wait. Offering no
	// transitions here is deliberate: a "publish" button that silently does
	// nothing is worse than no button.
	pending_review: [],
	rejected: [
		{
			next: "published",
			label: "Resubmit for review",
			description:
				"This sends the service back to the MaterialHub team for review.",
			done: "has been resubmitted for review",
		},
	],
};

// Resolves the vendor-facing actions for a status, substituting the publish copy
// for whatever the server says a publish request will actually do right now.
// `publishRequiresReview` comes straight off the offering payload — do not
// compute it from a trust flag on the client.
export function getOfferingStatusActions(
	status: OfferingStatus,
	opts: { publishRequiresReview: boolean },
): OfferingStatusAction[] {
	const actions = OFFERING_STATUS_ACTIONS[status] ?? [];
	if (!opts.publishRequiresReview) return actions;
	return actions.map((action) =>
		action === PUBLISH_PLACEHOLDER ? PUBLISH_NEEDS_REVIEW : action,
	);
}
