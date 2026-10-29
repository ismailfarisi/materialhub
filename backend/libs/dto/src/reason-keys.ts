import registry from "./reason-keys.json" with { type: "json" };

export const REASON_KEYS = registry.keys as readonly string[];
const REASON_KEY_SET = new Set(REASON_KEYS);

export type ReasonKey = (typeof REASON_KEYS)[number];

export function isReasonKey(key: string): key is ReasonKey {
  return REASON_KEY_SET.has(key);
}

export function assertReasonKey(key: string): ReasonKey {
  if (!REASON_KEY_SET.has(key)) {
    throw new Error(`Unknown reason_key: "${key}" — add it to libs/dto/src/reason-keys.json`);
  }
  return key as ReasonKey;
}
