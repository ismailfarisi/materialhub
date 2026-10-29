// ical-fetch-guard.test.ts
//
// Mocked unit tests for the SSRF/streaming-cap guard added in review fix
// cycle 1 (findings I-1, I-2). No network / no DNS for the address-range
// table (every case is a literal IP so `net.isIP` short-circuits DNS); no
// real fetch (FetchLike is a hand-built mock per test).
import { describe, expect, it, mock } from "bun:test";
import {
  IcalFetchError,
  UnsafeIcalUrlError,
  assertSafeIcalUrl,
  fetchIcalFeedSafely,
  isForbiddenAddress,
} from "./ical-fetch-guard.ts";

describe("isForbiddenAddress — range table", () => {
  it.each([
    ["127.0.0.1", true, "loopback v4"],
    ["127.255.255.255", true, "loopback v4 (whole /8)"],
    ["::1", true, "loopback v6 (canonical)"],
    ["0:0:0:0:0:0:0:1", true, "loopback v6 (expanded, non-canonical)"],
    ["10.0.0.5", true, "RFC1918 10/8"],
    ["172.16.0.1", true, "RFC1918 172.16/12 (low end)"],
    ["172.31.255.255", true, "RFC1918 172.16/12 (high end)"],
    ["172.32.0.1", false, "just outside 172.16/12"],
    ["192.168.1.1", true, "RFC1918 192.168/16"],
    ["169.254.1.1", true, "link-local 169.254/16"],
    ["169.254.169.254", true, "AWS/GCP IMDS"],
    ["fe80::1", true, "IPv6 link-local fe80::/10 (canonical)"],
    ["fe80:0:0:0:0:0:0:1", true, "IPv6 link-local fe80::/10 (expanded)"],
    ["febf:ffff::1", true, "IPv6 link-local fe80::/10 (high end)"],
    ["fec0::1", false, "just outside fe80::/10"],
    ["fc00::1", true, "IPv6 unique-local fc00::/7 (canonical)"],
    ["fc00:0:0:0:0:0:0:1", true, "IPv6 unique-local fc00::/7 (expanded)"],
    ["fdff:ffff::1", true, "IPv6 unique-local fc00::/7 (high end)"],
    ["0.0.0.0", true, "unspecified v4"],
    ["::", true, "unspecified v6 (canonical)"],
    ["0:0:0:0:0:0:0:0", true, "unspecified v6 (expanded)"],
    ["::ffff:127.0.0.1", true, "IPv4-mapped IPv6 loopback (canonical dotted)"],
    ["::ffff:7f00:1", true, "IPv4-mapped IPv6 loopback (canonical hex)"],
    ["0:0:0:0:0:ffff:7f00:1", true, "IPv4-mapped IPv6 loopback (expanded hex, non-canonical)"],
    ["::ffff:169.254.169.254", true, "IPv4-mapped IPv6 IMDS (canonical dotted)"],
    ["0:0:0:0:0:ffff:a9fe:a9fe", true, "IPv4-mapped IPv6 IMDS (expanded, non-canonical)"],
    ["8.8.8.8", false, "public v4"],
    ["1.1.1.1", false, "public v4"],
    ["2606:4700:4700::1111", false, "public v6 (canonical)"],
    ["2001:4860:4860:0:0:0:0:8888", false, "public v6 (expanded, non-canonical)"],
    ["::ffff:8.8.8.8", false, "IPv4-mapped IPv6 public (canonical dotted)"],
    ["not-an-ip", true, "unparseable -> fail closed"],
  ])("%s -> forbidden=%s (%s)", (ip, expected) => {
    expect(isForbiddenAddress(ip)).toBe(expected);
  });
});

describe("assertSafeIcalUrl", () => {
  it("rejects non-http(s) schemes", async () => {
    await expect(assertSafeIcalUrl("ftp://example.com/x.ics")).rejects.toBeInstanceOf(
      UnsafeIcalUrlError,
    );
  });

  it("rejects the literal hostname localhost", async () => {
    await expect(assertSafeIcalUrl("http://localhost/x.ics")).rejects.toMatchObject({
      reason: "blocked_hostname",
    });
  });

  it("rejects *.internal hostnames", async () => {
    await expect(assertSafeIcalUrl("http://calendar.internal/x.ics")).rejects.toMatchObject({
      reason: "blocked_hostname",
    });
  });

  it("rejects an IP literal in the forbidden ranges without any DNS lookup", async () => {
    await expect(
      assertSafeIcalUrl("http://169.254.169.254/latest/meta-data/"),
    ).rejects.toMatchObject({ reason: "private_address" });
  });

  it("rejects a bracketed IPv6 loopback literal", async () => {
    await expect(assertSafeIcalUrl("http://[::1]/x.ics")).rejects.toMatchObject({
      reason: "private_address",
    });
  });

  it("allows a public IP literal (no DNS resolution needed)", async () => {
    await expect(assertSafeIcalUrl("https://1.1.1.1/x.ics")).resolves.toBeUndefined();
  });
});

// ── fetchIcalFeedSafely ──────────────────────────────────────────────────────

function textResponse(
  body: string,
  opts: { status?: number; headers?: Record<string, string> } = {},
) {
  const headers = new Map(Object.entries(opts.headers ?? {}));
  const bytes = new TextEncoder().encode(body);
  let sent = false;
  return {
    status: opts.status ?? 200,
    ok: (opts.status ?? 200) >= 200 && (opts.status ?? 200) < 300,
    headers: { get: (k: string) => headers.get(k.toLowerCase()) ?? null },
    text: async () => body,
    body: {
      getReader: () => ({
        read: mock(async () => {
          if (sent) return { done: true, value: undefined };
          sent = true;
          return { done: false, value: bytes };
        }),
        cancel: mock(async () => {}),
      }),
    },
  } as unknown as Response;
}

function redirectResponse(location: string) {
  return {
    status: 302,
    ok: false,
    headers: { get: (k: string) => (k.toLowerCase() === "location" ? location : null) },
  } as unknown as Response;
}

describe("fetchIcalFeedSafely — redirect re-validation", () => {
  it("follows a redirect to a safe URL and returns the final body", async () => {
    const calls: string[] = [];
    const fetchImpl = mock(async (url: string) => {
      calls.push(url);
      if (url === "https://1.1.1.1/start.ics") {
        return redirectResponse("https://1.1.1.1/final.ics");
      }
      return textResponse("BEGIN:VCALENDAR\nEND:VCALENDAR");
    });

    const text = await fetchIcalFeedSafely("https://1.1.1.1/start.ics", fetchImpl as any, {
      timeoutMs: 5000,
      maxBytes: 1024,
    });

    expect(text).toBe("BEGIN:VCALENDAR\nEND:VCALENDAR");
    expect(calls).toEqual(["https://1.1.1.1/start.ics", "https://1.1.1.1/final.ics"]);
  });

  it("re-validates each redirect Location and rejects a hop into a private address", async () => {
    const calls: string[] = [];
    const fetchImpl = mock(async (url: string) => {
      calls.push(url);
      return redirectResponse("http://169.254.169.254/latest/meta-data/");
    });

    await expect(
      fetchIcalFeedSafely("https://1.1.1.1/start.ics", fetchImpl as any, {
        timeoutMs: 5000,
        maxBytes: 1024,
      }),
    ).rejects.toMatchObject({ classified: "invalid or disallowed URL" });

    // Only the first hop was ever fetched — the malicious redirect target was
    // never actually requested.
    expect(calls).toEqual(["https://1.1.1.1/start.ics"]);
  });

  it("caps the chain at 3 total requests", async () => {
    let n = 0;
    const fetchImpl = mock(async () => {
      n++;
      return redirectResponse(`https://1.1.1.1/hop-${n}.ics`);
    });

    await expect(
      fetchIcalFeedSafely("https://1.1.1.1/start.ics", fetchImpl as any, {
        timeoutMs: 5000,
        maxBytes: 1024,
      }),
    ).rejects.toMatchObject({ classified: "too many redirects" });

    // Review finding 9: the guard was `redirectCount > MAX_REDIRECTS`, which
    // permitted start + 3 followed hops = 4 requests despite MAX_REDIRECTS = 3.
    // It is now `>=`, so the budget is 3 requests (start + 2 followed hops).
    expect(n).toBe(3);
  });

  it("classifies a non-2xx/3xx response as a short HTTP-status message", async () => {
    const fetchImpl = mock(async () => textResponse("", { status: 500 }));

    await expect(
      fetchIcalFeedSafely("https://1.1.1.1/x.ics", fetchImpl as any, {
        timeoutMs: 5000,
        maxBytes: 1024,
      }),
    ).rejects.toMatchObject({ classified: "fetch failed: HTTP 500" });
  });
});

describe("fetchIcalFeedSafely — streaming size cap (I-2)", () => {
  it("rejects via Content-Length fast-path without reading the body", async () => {
    const readMock = mock(async () => ({ done: true, value: undefined }));
    const fetchImpl = mock(async () => {
      return {
        status: 200,
        ok: true,
        headers: { get: (k: string) => (k.toLowerCase() === "content-length" ? "999999" : null) },
        body: { getReader: () => ({ read: readMock, cancel: mock(async () => {}) }) },
      } as unknown as Response;
    });

    await expect(
      fetchIcalFeedSafely("https://1.1.1.1/huge.ics", fetchImpl as any, {
        timeoutMs: 5000,
        maxBytes: 100,
      }),
    ).rejects.toMatchObject({ classified: "feed too large" });

    expect(readMock).not.toHaveBeenCalled();
  });

  it("aborts mid-stream once the running byte count exceeds the cap, without buffering the full body", async () => {
    const CAP = 50;
    const CHUNK = new Uint8Array(20).fill(65); // 20 'A' bytes per chunk
    let chunksServed = 0;
    const TOTAL_AVAILABLE_CHUNKS = 1000; // if fully drained this would be 20_000 bytes
    const cancelMock = mock(async () => {});
    const readMock = mock(async () => {
      if (chunksServed >= TOTAL_AVAILABLE_CHUNKS) return { done: true, value: undefined };
      chunksServed++;
      return { done: false, value: CHUNK };
    });
    const fetchImpl = mock(async () => {
      return {
        status: 200,
        ok: true,
        headers: { get: () => null }, // no Content-Length -> must stream to discover size
        body: { getReader: () => ({ read: readMock, cancel: cancelMock }) },
      } as unknown as Response;
    });

    await expect(
      fetchIcalFeedSafely("https://1.1.1.1/huge.ics", fetchImpl as any, {
        timeoutMs: 5000,
        maxBytes: CAP,
      }),
    ).rejects.toMatchObject({ classified: "feed too large" });

    // 3 chunks (60 bytes) is enough to cross the 50-byte cap — the reader
    // must NOT have been drained anywhere near TOTAL_AVAILABLE_CHUNKS, proving
    // the guard aborted mid-stream instead of buffering everything first.
    expect(chunksServed).toBeLessThan(10);
    expect(chunksServed).toBeGreaterThan(0);
    expect(cancelMock).toHaveBeenCalledTimes(1);
  });

  it("accepts a feed under the cap", async () => {
    const fetchImpl = mock(async () => textResponse("BEGIN:VCALENDAR\nEND:VCALENDAR"));
    const text = await fetchIcalFeedSafely("https://1.1.1.1/small.ics", fetchImpl as any, {
      timeoutMs: 5000,
      maxBytes: 1024,
    });
    expect(text).toBe("BEGIN:VCALENDAR\nEND:VCALENDAR");
  });
});

describe("fetchIcalFeedSafely — URL validation before any fetch", () => {
  it("never calls fetchImpl for a disallowed initial URL", async () => {
    const fetchImpl = mock(async () => textResponse("should not be reached"));

    await expect(
      fetchIcalFeedSafely("http://127.0.0.1/x.ics", fetchImpl as any, {
        timeoutMs: 5000,
        maxBytes: 1024,
      }),
    ).rejects.toBeInstanceOf(IcalFetchError);

    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
