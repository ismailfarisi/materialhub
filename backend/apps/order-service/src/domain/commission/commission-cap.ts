/**
 * order-service's handle on the shared commission ceiling.
 *
 * The implementation moved to `@materialhub/utils` (libs/utils/src/commission-cap.ts)
 * in round 4: there are THREE paths that produce a commission amount, and the
 * third — booking-service's CommissionSnapshotService — cannot import from
 * order-service, so it kept the uncapped `Math.min(rate, net)` and wrote
 * negative vendor earnings into the same payout pipeline. Re-exported here so
 * the existing order-service imports keep pointing at one definition rather
 * than a second copy of it.
 */
export { maxCommissionForNet } from "@materialhub/utils";
