import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { config } from "@materialhub/config";
import { HttpError } from "@materialhub/plugins";

/**
 * The second step of a 2FA login must prove the first step (password)
 * happened. /auth/login returns this short-lived challenge instead of the bare
 * user id it used to return; /auth/2fa/login-verify and backup-verify require
 * it. Without it, anyone holding a user id could log in with only a TOTP
 * guess.
 *
 * Deliberately not a JWT under the access-token secret: a challenge must never
 * be usable as (or confused with) an access token, so it is an HMAC over its
 * own derived key with its own format.
 */

const TTL_SECONDS = 5 * 60;
/** Wrong codes allowed per challenge before it is burned. */
const MAX_ATTEMPTS = 5;
/** A code accepted for a user can't be reused within this window. */
const REPLAY_WINDOW_MS = 90_000;

const key = () => createHmac("sha256", config.jwt.accessSecret).update("2fa-challenge/v1").digest();

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");

const attempts = new Map<string, { count: number; exp: number }>();
const burned = new Map<string, number>();
const lastAccepted = new Map<string, { code: string; at: number }>();

function sweep(now: number) {
  for (const [jti, a] of attempts) if (a.exp * 1000 < now) attempts.delete(jti);
  for (const [jti, exp] of burned) if (exp * 1000 < now) burned.delete(jti);
  for (const [uid, l] of lastAccepted) if (now - l.at > REPLAY_WINDOW_MS) lastAccepted.delete(uid);
}

export function issueTwoFactorChallenge(userId: string, now = Date.now()): string {
  const body = b64(
    JSON.stringify({ uid: userId, jti: randomUUID(), exp: Math.floor(now / 1000) + TTL_SECONDS }),
  );
  const sig = b64(createHmac("sha256", key()).update(body).digest());
  return `${body}.${sig}`;
}

const invalid = () =>
  new HttpError(
    401,
    "Login challenge is invalid or expired; sign in again",
    "INVALID_2FA_CHALLENGE",
  );

/** Returns the user id and challenge id, or throws 401. */
export function readTwoFactorChallenge(
  token: string,
  now = Date.now(),
): { userId: string; jti: string } {
  const [body, sig] = (token ?? "").split(".");
  if (!body || !sig) throw invalid();
  const expected = createHmac("sha256", key()).update(body).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw invalid();
  let payload: { uid?: string; jti?: string; exp?: number };
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    throw invalid();
  }
  if (!payload.uid || !payload.jti || !payload.exp || payload.exp * 1000 < now) throw invalid();
  if (burned.has(payload.jti)) throw invalid();
  return { userId: payload.uid, jti: payload.jti };
}

/**
 * Run a code check for a challenge: counts failures (burning the challenge
 * after MAX_ATTEMPTS), rejects a code just accepted for the same user, and
 * burns the challenge on success so it can't be replayed.
 */
export async function verifyWithChallenge(
  token: string,
  code: string,
  check: (userId: string, code: string) => Promise<boolean>,
  now = Date.now(),
): Promise<string> {
  sweep(now);
  const { userId, jti } = readTwoFactorChallenge(token, now);
  const recent = lastAccepted.get(userId);
  const replay = recent && recent.code === code && now - recent.at < REPLAY_WINDOW_MS;
  const ok = !replay && (await check(userId, code));
  if (!ok) {
    const a = attempts.get(jti) ?? { count: 0, exp: Math.floor(now / 1000) + TTL_SECONDS };
    a.count += 1;
    attempts.set(jti, a);
    if (a.count >= MAX_ATTEMPTS) burned.set(jti, a.exp);
    throw new HttpError(400, "Invalid verification code", "INVALID_2FA_CODE");
  }
  burned.set(jti, Math.floor(now / 1000) + TTL_SECONDS);
  attempts.delete(jti);
  lastAccepted.set(userId, { code, at: now });
  return userId;
}

/** Test helper. */
export function resetTwoFactorChallengeState(): void {
  attempts.clear();
  burned.clear();
  lastAccepted.clear();
}
