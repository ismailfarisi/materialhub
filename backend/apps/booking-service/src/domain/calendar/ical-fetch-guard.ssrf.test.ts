// ical-fetch-guard.ssrf.test.ts
//
// Security regression tests for the SSRF guard, covering the gaps review
// finding 4 identified in the ORIGINAL ical-fetch-guard.test.ts: all 46 of its
// cases pass an IP LITERAL, which makes `net.isIP` short-circuit before
// `dns.lookup` is ever called — so the multi-record DNS path, which is the
// actual core of the guard and where every discovered bypass lived, had ZERO
// coverage.
//
// This file therefore drives the guard through a MOCKED resolver (mock.module
// on "node:dns/promises", applied before a dynamic import of the module under
// test so the mock is in place when the import binding is resolved), plus the
// URL-shape vectors that never reach address checking at all.
//
// No network, no real DNS, no real fetch.
import { afterEach, describe, expect, it, mock } from "bun:test";

type DnsRecord = { address: string; family: number };

// Installs a fake resolver and returns a FRESH copy of the guard bound to it.
// `bun:test`'s module registry is keyed by specifier, so the dynamic import
// below picks up the mock installed immediately before it.
async function loadGuardWithDns(records: Record<string, DnsRecord[]>) {
  mock.module("node:dns/promises", () => ({
    default: {
      lookup: async (hostname: string, _opts?: unknown) => {
        const found = records[hostname];
        if (!found) {
          const err = new Error("ENOTFOUND") as Error & { code: string };
          err.code = "ENOTFOUND";
          throw err;
        }
        return found;
      },
    },
  }));
  return import("./ical-fetch-guard.ts");
}

const v4 = (address: string): DnsRecord => ({ address, family: 4 });
const v6 = (address: string): DnsRecord => ({ address, family: 6 });

afterEach(() => {
  mock.restore();
});

describe("assertSafeIcalUrl — DNS resolution path (review finding 4)", () => {
  it("rejects a hostname whose single A record is a private address", async () => {
    const { assertSafeIcalUrl, UnsafeIcalUrlError } = await loadGuardWithDns({
      "feed.evil.test": [v4("10.1.2.3")],
    });
    const err = await assertSafeIcalUrl("https://feed.evil.test/cal.ics").catch((e) => e);
    expect(err).toBeInstanceOf(UnsafeIcalUrlError);
    expect((err as { reason: string }).reason).toBe("private_address");
  });

  it("rejects a hostname resolving to cloud metadata via DNS", async () => {
    const { assertSafeIcalUrl } = await loadGuardWithDns({
      "metadata.evil.test": [v4("169.254.169.254")],
    });
    await expect(assertSafeIcalUrl("https://metadata.evil.test/latest/meta")).rejects.toThrow();
  });

  // THE case the literal-only suite could never express: `dns.lookup` is called
  // with `{ all: true }` precisely so a multi-record answer can't smuggle one
  // private address past a check that only looked at the first record.
  it("rejects when only ONE of several A/AAAA records is private", async () => {
    const { assertSafeIcalUrl, UnsafeIcalUrlError } = await loadGuardWithDns({
      "mixed.evil.test": [v4("93.184.216.34"), v4("8.8.8.8"), v4("127.0.0.1")],
    });
    const err = await assertSafeIcalUrl("https://mixed.evil.test/cal.ics").catch((e) => e);
    expect(err).toBeInstanceOf(UnsafeIcalUrlError);
    expect((err as { reason: string }).reason).toBe("private_address");
  });

  it("rejects when the private record is an AAAA among public A records", async () => {
    const { assertSafeIcalUrl } = await loadGuardWithDns({
      "dual.evil.test": [v4("93.184.216.34"), v6("::1")],
    });
    await expect(assertSafeIcalUrl("https://dual.evil.test/cal.ics")).rejects.toThrow();
  });

  it("rejects a hostname resolving to a NAT64-mapped metadata address", async () => {
    const { assertSafeIcalUrl } = await loadGuardWithDns({
      "nat64.evil.test": [v6("64:ff9b::169.254.169.254")],
    });
    await expect(assertSafeIcalUrl("https://nat64.evil.test/cal.ics")).rejects.toThrow();
  });

  it("allows a hostname whose records are ALL public", async () => {
    const { assertSafeIcalUrl } = await loadGuardWithDns({
      "calendar.google.test": [v4("142.250.185.110"), v6("2001:4860:4860::8888")],
    });
    await expect(
      assertSafeIcalUrl("https://calendar.google.test/private/x.ics"),
    ).resolves.toBeUndefined();
  });

  it("rejects when the resolver returns no records at all", async () => {
    const { assertSafeIcalUrl, UnsafeIcalUrlError } = await loadGuardWithDns({
      "empty.test": [],
    });
    const err = await assertSafeIcalUrl("https://empty.test/cal.ics").catch((e) => e);
    expect(err).toBeInstanceOf(UnsafeIcalUrlError);
    expect((err as { reason: string }).reason).toBe("dns_resolution_failed");
  });

  it("rejects (never leaks) when resolution throws", async () => {
    const { assertSafeIcalUrl, UnsafeIcalUrlError } = await loadGuardWithDns({});
    const err = await assertSafeIcalUrl("https://nx.test/cal.ics").catch((e) => e);
    expect(err).toBeInstanceOf(UnsafeIcalUrlError);
    expect((err as { reason: string }).reason).toBe("dns_resolution_failed");
  });

  // A trailing dot is the FQDN root and resolves identically — it must not be
  // a way around the literal-hostname list.
  it("rejects the trailing-dot form of localhost", async () => {
    const { assertSafeIcalUrl, UnsafeIcalUrlError } = await loadGuardWithDns({});
    const err = await assertSafeIcalUrl("http://localhost./cal.ics").catch((e) => e);
    expect(err).toBeInstanceOf(UnsafeIcalUrlError);
    expect((err as { reason: string }).reason).toBe("blocked_hostname");
  });

  it.each([
    ["http://user:pw@feed.test/cal.ics", "credentials_in_url"],
    ["http://user@feed.test/cal.ics", "credentials_in_url"],
    ["https://feed.test:22/cal.ics", "bad_port"],
    ["https://feed.test:6379/cal.ics", "bad_port"],
    ["https://feed.test:5432/cal.ics", "bad_port"],
    ["ftp://feed.test/cal.ics", "bad_protocol"],
  ])("rejects %s with reason %s", async (url, reason) => {
    const { assertSafeIcalUrl } = await loadGuardWithDns({
      "feed.test": [v4("93.184.216.34")],
    });
    const err = await assertSafeIcalUrl(url).catch((e) => e);
    expect((err as { reason: string }).reason).toBe(reason);
  });

  it.each([
    ["https://feed.test/cal.ics"],
    ["https://feed.test:443/cal.ics"],
    ["http://feed.test:80/cal.ics"],
  ])("allows scheme-default port %s", async (url) => {
    const { assertSafeIcalUrl } = await loadGuardWithDns({
      "feed.test": [v4("93.184.216.34")],
    });
    await expect(assertSafeIcalUrl(url)).resolves.toBeUndefined();
  });

  // Alternate IPv4 encodings: these are not valid per `net.isIP`, so they used
  // to fall through to the resolver, which happily turns them into 127.0.0.1.
  it.each([
    ["http://2130706433/cal.ics", "decimal"],
    ["http://0x7f000001/cal.ics", "hex"],
    ["http://0177.0.0.1/cal.ics", "octal dotted"],
    ["http://127.1/cal.ics", "short form"],
  ])("rejects the %s IPv4 encoding (%s)", async (url) => {
    const { assertSafeIcalUrl } = await loadGuardWithDns({});
    await expect(assertSafeIcalUrl(url)).rejects.toThrow();
  });
});

describe("isForbiddenAddress — ranges added by review findings 2 and 3", () => {
  it.each([
    // ── Finding 3: the parser did not fail closed. `parseInt("127.0.0.1", 16)`
    // returns 295, not NaN, so these produced garbage hextets that matched no
    // forbidden range and were ALLOWED.
    ["::127.0.0.1", "IPv4-compatible loopback (::/96)"],
    ["::10.0.0.1", "IPv4-compatible RFC1918 (::/96)"],
    ["::169.254.169.254", "IPv4-compatible IMDS (::/96)"],
    ["64:ff9b::169.254.169.254", "NAT64 well-known prefix -> IMDS"],
    ["64:ff9b::8.8.8.8", "NAT64 well-known prefix (any target)"],
    ["64:ff9b:1::169.254.169.254", "NAT64 local-use prefix (RFC 8215)"],
    ["2002:7f00:1::1", "6to4 embedding 127.0.0.1"],
    ["2002:a00:1::1", "6to4 embedding 10.0.0.1"],
    ["2001:0:4136:e378::1", "Teredo"],
    ["100::1", "discard-only prefix"],
    ["ff02::1", "IPv6 multicast"],
    // ── Finding 2: missing IPv4 ranges.
    ["100.64.0.1", "CGNAT 100.64/10 (low end)"],
    ["100.127.255.255", "CGNAT 100.64/10 (high end)"],
    ["192.0.0.192", "IETF protocol assignments 192.0.0.0/24"],
    ["224.0.0.1", "multicast 224/4"],
    ["239.255.255.255", "multicast 224/4 (high end)"],
    ["240.0.0.1", "reserved 240/4"],
    ["255.255.255.255", "broadcast"],
  ])("blocks %s (%s)", async (ip) => {
    const { isForbiddenAddress } = await loadGuardWithDns({});
    expect(isForbiddenAddress(ip)).toBe(true);
  });

  it.each([
    ["8.8.8.8", "public v4"],
    ["93.184.216.34", "public v4"],
    ["100.63.255.255", "just below CGNAT 100.64/10"],
    ["100.128.0.1", "just above CGNAT 100.64/10"],
    ["192.0.1.1", "just outside 192.0.0.0/24"],
    ["223.255.255.255", "just below multicast 224/4"],
    ["2001:4860:4860::8888", "public v6"],
    ["2a00:1450:4001::200e", "public v6"],
  ])("still allows %s (%s)", async (ip) => {
    const { isForbiddenAddress } = await loadGuardWithDns({});
    expect(isForbiddenAddress(ip)).toBe(false);
  });

  // The invariant the module DOCUMENTS but did not hold before finding 3:
  // anything unparseable must be treated as forbidden, never allowed.
  it.each([
    ["not-an-ip"],
    [""],
    ["::ffff:999.0.0.1"],
    ["1:2:3:4:5:6:7:8:9"],
    ["fe80::1::2"],
    ["fe80::1%eth0"],
    ["12345::1"],
    ["::gggg"],
    ["1.2.3"],
    ["1.2.3.4.5"],
    ["0x1.0x2.0x3.0x4"],
    // Dotted text in a NON-trailing position. NOTE: these are rejected by
    // `net.isIP` before `isForbiddenIPv6` is even reached, so they pin the
    // fail-closed CONTRACT rather than the hextet regex specifically — the
    // regex is defence in depth behind net.isIP. The parser rewrite that
    // actually matters is exercised by the ::/96, NAT64, 6to4 and Teredo cases
    // above, which ARE valid IPv6 (net.isIP accepts them) and were the ones
    // `Number.parseInt("127.0.0.1", 16) === 295` let through.
    ["1.2::3"],
    ["fe80:1.2::3"],
    ["::7f00:1.2"],
    ["::ffff:1.2.3.4.5"],
  ])("fails closed on unparseable input %p", async (ip) => {
    const { isForbiddenAddress } = await loadGuardWithDns({});
    expect(isForbiddenAddress(ip)).toBe(true);
  });
});

describe("fetchIcalFeedSafely — redirect budget (review finding 9)", () => {
  it("issues at most 3 requests across a redirect chain", async () => {
    const { fetchIcalFeedSafely, IcalFetchError } = await loadGuardWithDns({
      "a.test": [v4("93.184.216.34")],
    });

    let calls = 0;
    const fetchImpl = async () => {
      calls++;
      return new Response(null, {
        status: 302,
        headers: { location: "https://a.test/next" },
      });
    };

    const err = await fetchIcalFeedSafely("https://a.test/start", fetchImpl, {
      timeoutMs: 1000,
      maxBytes: 1024,
    }).catch((e) => e);

    expect(err).toBeInstanceOf(IcalFetchError);
    expect((err as { classified: string }).classified).toBe("too many redirects");
    // `> MAX_REDIRECTS` permitted a 4th request; `>= MAX_REDIRECTS` caps at 3.
    expect(calls).toBe(3);
  });

  it("re-validates each redirect target, blocking a public -> private hop", async () => {
    const { fetchIcalFeedSafely, IcalFetchError } = await loadGuardWithDns({
      "a.test": [v4("93.184.216.34")],
      "internal.test": [v4("169.254.169.254")],
    });

    const fetchImpl = async (url: string) => {
      if (url.startsWith("https://a.test")) {
        return new Response(null, {
          status: 302,
          headers: { location: "https://internal.test/latest/meta" },
        });
      }
      return new Response("SHOULD NEVER BE REACHED", { status: 200 });
    };

    const err = await fetchIcalFeedSafely("https://a.test/start", fetchImpl, {
      timeoutMs: 1000,
      maxBytes: 1024,
    }).catch((e) => e);

    expect(err).toBeInstanceOf(IcalFetchError);
    expect((err as { classified: string }).classified).toBe("invalid or disallowed URL");
  });
});
