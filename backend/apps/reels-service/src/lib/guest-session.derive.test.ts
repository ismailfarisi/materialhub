import { describe, expect, it } from "bun:test";
import { hashGuestSessionToken } from "./guest-session.derive.ts";

describe("hashGuestSessionToken", () => {
  it("produces a stable SHA-256 hex of the input", () => {
    const h1 = hashGuestSessionToken("abc123");
    const h2 = hashGuestSessionToken("abc123");
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64); // SHA-256 hex
  });

  it("differs for different inputs", () => {
    expect(hashGuestSessionToken("a")).not.toBe(hashGuestSessionToken("b"));
  });
});
