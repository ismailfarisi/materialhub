import { getCookie, setCookie } from "cookies-next/client";

export type ConsentDecision = "accepted" | "rejected" | null;

const COOKIE = "materialhub_consent";
const MAX_AGE = 60 * 60 * 24 * 365; // 365 days

export function readConsentCookie(): ConsentDecision {
  const v = getCookie(COOKIE);
  return v === "accepted" || v === "rejected" ? v : null;
}

export function writeConsentCookie(
  decision: Exclude<ConsentDecision, null>,
): void {
  setCookie(COOKIE, decision, {
    maxAge: MAX_AGE,
    sameSite: "lax",
    path: "/",
  });
}
