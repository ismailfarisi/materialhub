/**
 * order-service's handle on the shared commission ceiling.
 *
 * The implementation moved to `@materialhub/utils` (libs/utils/src/commission-cap.ts)
 * in round 4 so every path that produces a commission amount shares one
 * definition instead of keeping its own uncapped `Math.min(rate, net)` copy.
 * Re-exported here so the existing order-service imports keep pointing at it.
 */
export { maxCommissionForNet } from "@materialhub/utils";
