import { describe, expect, it } from "bun:test";
import { resolveUpstream } from "./proxy.ts";

describe("affiliate gateway routing", () => {
  it("routes /a/:slug to a service (verbatim prefix)", () => {
    const r = resolveUpstream("/a/AFF-ABC12345");
    expect(r).not.toBeNull();
    expect(r?.upstreamPath).toBe("/a/AFF-ABC12345");
  });

  it("routes /a/track the same way", () => {
    const r = resolveUpstream("/a/track");
    expect(r).not.toBeNull();
    expect(r?.upstreamPath).toBe("/a/track");
  });
});
