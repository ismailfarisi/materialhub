"use client";

import { useMe } from "@/lib/queries/auth";
import { normalizeUaePhone } from "./phone";
import type { MetaAdvancedMatching } from "./registry";

/**
 * Returns the Meta Advanced Matching object for the current signed-in user.
 * Returns null for guests or while auth is loading. Values are passed RAW —
 * Meta Pixel hashes them browser-side per spec.
 */
export function useMetaAdvancedMatching(): MetaAdvancedMatching | null {
  const { data, isLoading } = useMe(true);
  if (isLoading || !data) return null;

  const am: MetaAdvancedMatching = {
    country: "ae",
    external_id: data.id,
  };
  if (data.email) am.em = data.email.trim().toLowerCase();
  if (data.phone) am.ph = normalizeUaePhone(data.phone);
  if (data.first_name) am.fn = data.first_name.trim().toLowerCase();
  if (data.last_name) am.ln = data.last_name.trim().toLowerCase();
  if (data.city) am.ct = data.city.trim().toLowerCase();
  return am;
}
