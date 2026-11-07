import { beforeEach, describe, expect, test } from "bun:test";
import {
  issueTwoFactorChallenge,
  readTwoFactorChallenge,
  resetTwoFactorChallengeState,
  verifyWithChallenge,
} from "./two-factor-challenge.ts";

const UID = "11111111-2222-4333-8444-555555555555";
const okFor = (good: string) => async (_uid: string, code: string) => code === good;

beforeEach(() => resetTwoFactorChallengeState());

describe("2FA login challenge", () => {
  test("round-trips the user id", () => {
    expect(readTwoFactorChallenge(issueTwoFactorChallenge(UID)).userId).toBe(UID);
  });

  test("a bare user id (the old request shape) is not a challenge", () => {
    expect(() => readTwoFactorChallenge(UID)).toThrow();
  });

  test("a tampered challenge is rejected", () => {
    const t = issueTwoFactorChallenge(UID);
    const [body, sig] = t.split(".");
    const forged = Buffer.from(
      JSON.stringify({
        ...JSON.parse(Buffer.from(body!, "base64url").toString()),
        uid: "someone-else",
      }),
    ).toString("base64url");
    expect(() => readTwoFactorChallenge(`${forged}.${sig}`)).toThrow();
  });

  test("expires after 5 minutes", () => {
    const now = Date.now();
    const t = issueTwoFactorChallenge(UID, now);
    expect(() => readTwoFactorChallenge(t, now + 5 * 60_000 + 1000)).toThrow();
  });

  test("a correct code logs in once; the challenge can't be replayed", async () => {
    const t = issueTwoFactorChallenge(UID);
    expect(await verifyWithChallenge(t, "123456", okFor("123456"))).toBe(UID);
    await expect(verifyWithChallenge(t, "123456", okFor("123456"))).rejects.toThrow();
  });

  test("burns the challenge after 5 wrong codes", async () => {
    const t = issueTwoFactorChallenge(UID);
    for (let i = 0; i < 5; i++) {
      await expect(verifyWithChallenge(t, `00000${i}`, okFor("123456"))).rejects.toThrow();
    }
    await expect(verifyWithChallenge(t, "123456", okFor("123456"))).rejects.toThrow();
  });

  test("the same code can't be reused on a new challenge within the window", async () => {
    await verifyWithChallenge(issueTwoFactorChallenge(UID), "123456", okFor("123456"));
    await expect(
      verifyWithChallenge(issueTwoFactorChallenge(UID), "123456", okFor("123456")),
    ).rejects.toThrow("Invalid verification code");
  });
});
