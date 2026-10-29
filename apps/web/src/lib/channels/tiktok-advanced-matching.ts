"use client";

import { useMe } from "@/lib/queries/auth";
import { normalizeUaePhone } from "./phone";
import type { TiktokAdvancedMatching } from "./registry";

/**
 * Returns the TikTok Advanced Matching object for the current signed-in user.
 * Returns null for guests or while auth is loading. Values are passed RAW —
 * TikTok Pixel hashes them browser-side per spec.
 *
 * Field names differ from Meta's AM shape: TikTok's identify() takes
 * `email` / `phone_number` / `external_id` (not `em` / `ph` / `external_id`).
 */
export function useTikTokAdvancedMatching(): TiktokAdvancedMatching | null {
  const { data, isLoading } = useMe(true);
  if (isLoading || !data) return null;

  const am: TiktokAdvancedMatching = {
    external_id: data.id,
  };
  if (data.email) am.email = data.email.trim().toLowerCase();
  if (data.phone) am.phone_number = normalizeUaePhone(data.phone);
  return am;
}
