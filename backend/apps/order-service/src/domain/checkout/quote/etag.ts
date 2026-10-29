import { createHash } from "node:crypto";

export interface EtagInputs {
  cartHash: string;
  addressId: string | null;
  userId: string | null;
  rulesEpoch: number;
  fxEpoch: string;
  /**
   * Applied-coupon fingerprint ("CODE:discount"), null when none. The cart
   * hash covers items only, so without this the ETag survives coupon
   * apply/remove and any revalidating cache (the browser's own HTTP cache
   * included) replays a 304 with the stale coupon state.
   */
  couponFingerprint?: string | null;
}

export function computeEtag(i: EtagInputs): string {
  const payload = [
    i.cartHash,
    i.addressId ?? "no_address",
    i.userId ?? "guest",
    String(i.rulesEpoch),
    i.fxEpoch,
    i.couponFingerprint ?? "no_coupon",
  ].join("|");
  return `"${createHash("sha256").update(payload).digest("hex")}"`;
}

export function fxEpochFromCapturedAt(capturedAtIso: string): string {
  return capturedAtIso.slice(0, 10);
}
