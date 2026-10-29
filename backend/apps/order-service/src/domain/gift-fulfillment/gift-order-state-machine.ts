import { GiftFulfillmentStatus as S } from "@materialhub/database";
import { HttpError } from "@materialhub/plugins";

const TRANSITIONS: Record<string, S[]> = {
  [S.awaiting_items]: [S.partially_received, S.ready_to_assemble, S.cancelled, S.exception],
  [S.partially_received]: [S.partially_received, S.ready_to_assemble, S.cancelled, S.exception],
  [S.ready_to_assemble]: [S.assembling, S.packed, S.cancelled, S.exception],
  [S.assembling]: [S.packed, S.cancelled, S.exception],
  [S.packed]: [S.shipped, S.cancelled, S.exception],
  [S.shipped]: [S.delivered, S.exception],
  [S.delivered]: [],
  [S.cancelled]: [],
  [S.exception]: [S.ready_to_assemble, S.cancelled],
};

export function canGiftTransition(from: S, to: S): boolean {
  return (TRANSITIONS[from] ?? []).includes(to);
}

export function assertGiftTransition(from: S, to: S): void {
  if (!canGiftTransition(from, to)) {
    throw new HttpError(
      422,
      `Invalid gift fulfillment transition: ${from} → ${to}`,
      "GIFT_FULFILLMENT_INVALID_TRANSITION",
    );
  }
}
