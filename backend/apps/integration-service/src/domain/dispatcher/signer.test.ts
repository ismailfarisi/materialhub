import { describe, expect, it } from "bun:test";
import { sign, verify } from "./signer.ts";

describe("signer", () => {
  const secret = "supersecret";
  const body = '{"hello":"world"}';
  const ts = "1745800000";

  it("produces deterministic signatures", () => {
    expect(sign(secret, ts, body)).toBe(sign(secret, ts, body));
  });

  it("changes signature on body change", () => {
    expect(sign(secret, ts, body)).not.toBe(sign(secret, ts, "{}"));
  });

  it("verifies a valid signature", () => {
    const sig = sign(secret, ts, body);
    expect(verify(secret, ts, body, sig)).toBe(true);
  });

  it("rejects an invalid signature", () => {
    expect(verify(secret, ts, body, "deadbeef")).toBe(false);
  });

  it("rejects mismatched length without throwing", () => {
    expect(verify(secret, ts, body, "short")).toBe(false);
  });
});
