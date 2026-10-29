/**
 * Which `vendors.payout_schedule` values the nightly payout job actually acts
 * on.
 *
 * Mirrors `closedPeriodFor` in
 * backend/apps/order-service/src/domain/commission/payout-period.ts, which
 * handles "daily", "weekly", "biweekly" and "monthly" and falls through to
 * `return null` for anything else. A vendor on an unhandled schedule is
 * skipped by the scheduler every single night, forever, with no error
 * anywhere: they simply never get paid.
 *
 * Round 4 found "Daily" offered here while the backend silently never paid it.
 * That was fixed on the BACKEND — `closedPeriodFor` now implements daily — so
 * the option is legitimate and stays. This list must track that function: if a
 * schedule is added there, add it here; if one is removed there, removing it
 * here is what stops an operator stranding a vendor by picking it.
 *
 * `vendors.payout_schedule` is an unconstrained varchar(50) with no CHECK, so
 * a value outside this list can already exist in the database (set by an
 * earlier build of this UI, or by hand). The edit form must therefore still be
 * able to DISPLAY such a value — see `payoutScheduleOptions` — otherwise the
 * select would silently show the first supported option and a save would
 * change the vendor's schedule without the operator ever choosing to.
 */
export interface PayoutScheduleOption {
	label: string;
	value: string;
}

export const SUPPORTED_PAYOUT_SCHEDULES: PayoutScheduleOption[] = [
	{ label: "Daily", value: "daily" },
	{ label: "Weekly", value: "weekly" },
	{ label: "Biweekly", value: "biweekly" },
	{ label: "Monthly", value: "monthly" },
];

const SUPPORTED_VALUES = new Set(SUPPORTED_PAYOUT_SCHEDULES.map((o) => o.value));

/** True when the nightly job will never produce a period for this schedule. */
export function isUnpaidPayoutSchedule(value: string | null | undefined): boolean {
	if (!value) return false;
	return !SUPPORTED_VALUES.has(value);
}

/**
 * Options for a schedule select. Appends the vendor's CURRENT value as a
 * clearly-flagged extra option when it is not one the scheduler honours, so
 * the form shows the truth instead of silently re-pointing it.
 */
export function payoutScheduleOptions(
	current?: string | null,
): PayoutScheduleOption[] {
	if (!isUnpaidPayoutSchedule(current)) return SUPPORTED_PAYOUT_SCHEDULES;
	return [
		{
			label: `${current} — never paid automatically`,
			value: current as string,
		},
		...SUPPORTED_PAYOUT_SCHEDULES,
	];
}

export function unpaidScheduleWarning(value: string | null | undefined): string | null {
	if (!isUnpaidPayoutSchedule(value)) return null;
	return `The payout scheduler has no period definition for "${value}", so this vendor is skipped every night and will never be paid automatically. Choose Daily, Weekly, Biweekly or Monthly, or generate this vendor's payouts by hand from the Payouts page.`;
}
