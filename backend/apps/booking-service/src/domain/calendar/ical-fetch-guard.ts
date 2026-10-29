// ical-fetch-guard.ts
//
// Phase 6 Task 4 fix cycle 1 (review findings I-1 SSRF-with-oracle, I-2
// unbounded body buffering) — the guarded server-side fetch for a
// vendor-supplied `ical_url`. Two responsibilities:
//
//   1. `isForbiddenAddress` / `assertSafeIcalUrl` — reject loopback, RFC1918,
//      link-local (incl. AWS/GCP IMDS 169.254.169.254), unique-local,
//      unspecified, and IPv4-mapped-IPv6 forms of the above, plus the literal
//      hostnames "localhost" and "*.internal". Resolution happens via
//      `node:dns/promises` `lookup(..., { all: true })` so every A/AAAA
//      record is checked, not just the one the OS resolver picks first.
//   2. `fetchIcalFeedSafely` — fetches with `redirect: "manual"`, re-running
//      `assertSafeIcalUrl` on every `Location` before following it (max 3
//      hops), and reads the body incrementally via `res.body.getReader()`
//      with a running byte counter so a hostile/huge feed is aborted mid
//      stream instead of fully buffered first.
//
// ── Residual risk (accepted, not fixed here) ────────────────────────────────
// This is resolve-then-fetch validation: `assertSafeIcalUrl` resolves the
// hostname, then `fetch()` resolves it AGAIN internally to actually connect.
// A DNS-rebinding attacker who flips the record between those two lookups
// (public IP at validation time, private/metadata IP at connect time) can
// still reach an internal address. Closing that gap needs a proxy-grade
// egress filter (pin the resolved IP and connect to it directly, e.g. via a
// custom `dns.lookup` passed to an HTTP agent) — out of scope for this fix
// cycle. What's fixed here is the *oracle*: the poller can no longer be
// pointed at 169.254.169.254 and have its exact failure reason echoed back
// to the vendor via GET, and a redirect chain can no longer bypass the
// initial-URL check.
import dns from "node:dns/promises";
import net from "node:net";

// Minimal fetch seam (global fetch is assignable to this) so the guarded
// fetch is testable without hitting the network.
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export class UnsafeIcalUrlError extends Error {
  constructor(public readonly reason: string) {
    super(`unsafe_ical_url:${reason}`);
  }
}

// Classified, vendor-safe message — this is what's allowed to land in
// `last_sync_error` (echoed verbatim by GET). Never the raw fetch/DNS error
// text, never a resolved address.
export class IcalFetchError extends Error {
  constructor(public readonly classified: string) {
    super(classified);
  }
}

// Redirect budget. `redirectCount` is the number of hops ALREADY followed, so
// the guard is `>=`: hop counts 0,1,2 issue requests and a 3rd redirect is
// refused — 3 requests / 2 followed redirects total. (`>` permitted a 4th
// request, review finding 9.)
const MAX_REDIRECTS = 3;

// Only the scheme-default ports are reachable. A vendor's real iCal feed
// (Google / Outlook / Fresha / Apple) is always served on 80/443; permitting
// arbitrary ports turns this fetch into an internal port scanner (:22, :6379,
// :5432, :9200 …) against any host that merely resolves publicly, which no
// address-range list can prevent. Deliberately narrow — widen only with a
// concrete feed provider that needs it.
const ALLOWED_PORTS = new Set(["", "80", "443"]);

// ── IPv4 range checks ───────────────────────────────────────────────────────

// Strict dotted-quad -> 4 octets. Rejects empty/hex/octal/oversized labels
// (`Number("0x7f")` and `Number("010")` would otherwise coerce happily), so an
// unparseable value can never be mistaken for a public address.
function parseIPv4Octets(ip: string): number[] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    octets.push(n);
  }
  return octets;
}

function isForbiddenIPv4(ip: string): boolean {
  const octets = parseIPv4Octets(ip);
  if (!octets) return true; // unparseable -> fail closed
  const a = octets[0] ?? -1;
  const b = octets[1] ?? -1;
  const c = octets[2] ?? -1;

  if (a === 0) return true; // 0.0.0.0/8 "this network" / unspecified
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 10) return true; // 10.0.0.0/8 RFC1918
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 RFC1918
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 RFC1918
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local + AWS/GCP IMDS
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT (RFC 6598)
  if (a === 192 && b === 0 && c === 0) return true; // 192.0.0.0/24 IETF protocol assignments
  if (a === 192 && b === 0 && c === 2) return true; // 192.0.2.0/24 TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmarking
  if (a === 198 && b === 51 && c === 100) return true; // 198.51.100.0/24 TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true; // 203.0.113.0/24 TEST-NET-3
  if (a >= 224 && a <= 239) return true; // 224.0.0.0/4 multicast
  if (a >= 240) return true; // 240.0.0.0/4 reserved + 255.255.255.255 broadcast
  return false;
}

// ── IPv6 range checks ───────────────────────────────────────────────────────

const HEXTET_RE = /^[0-9a-f]{1,4}$/;

/**
 * Parse an IPv6 address string into exactly 8 numeric hextets, or return null.
 *
 * FAILS CLOSED BY CONSTRUCTION (review finding 3). The previous implementation
 * fed each `:`-separated segment to `Number.parseInt(seg, 16)`, which stops at
 * the first invalid character instead of rejecting: `parseInt("127.0.0.1", 16)`
 * is 295, NOT NaN. Any `::`-compressed address carrying a dotted quad that
 * wasn't literally `::ffff:a.b.c.d` therefore parsed into garbage hextets that
 * matched no forbidden range and was ALLOWED — the root cause of the NAT64 /
 * IPv4-compatible bypasses. Every segment is now validated against an explicit
 * regex, and a trailing dotted quad (RFC 4291 `x:x:x:x:x:x:d.d.d.d`, which is
 * legal in ANY IPv6 address, not just `::ffff:`) is converted to its two
 * hextets up front rather than special-cased for one prefix.
 *
 * Example: "::1"                      → [0,0,0,0,0,0,0,1]
 *          "::127.0.0.1"              → [0,0,0,0,0,0,0x7f00,0x0001]
 *          "64:ff9b::169.254.169.254" → [0x64,0xff9b,0,0,0,0,0xa9fe,0xa9fe]
 */
function parseIPv6ToHextets(ip: string): number[] | null {
  let normalized = ip.toLowerCase();

  // A zone/scope id ("fe80::1%eth0") is not a routable literal here — reject
  // rather than silently ignore the suffix.
  if (normalized.includes("%")) return null;
  if (normalized.includes(":::")) return null;

  // Trailing dotted quad -> two hextets, textually substituted so the rest of
  // the parser only ever sees pure hex.
  const lastColon = normalized.lastIndexOf(":");
  const lastSegment = lastColon === -1 ? normalized : normalized.slice(lastColon + 1);
  if (lastSegment.includes(".")) {
    if (lastColon === -1) return null; // a bare dotted quad is not IPv6
    const octets = parseIPv4Octets(lastSegment);
    if (!octets) return null; // not EXACTLY a dotted quad -> fail closed
    const o0 = octets[0] ?? 0;
    const o1 = octets[1] ?? 0;
    const o2 = octets[2] ?? 0;
    const o3 = octets[3] ?? 0;
    const hi = ((o0 << 8) | o1).toString(16);
    const lo = ((o2 << 8) | o3).toString(16);
    normalized = `${normalized.slice(0, lastColon + 1)}${hi}:${lo}`;
  }

  const doubleColonIndex = normalized.indexOf("::");

  if (doubleColonIndex === -1) {
    // No :: compression — must be exactly 8 hextets separated by :
    const parts = normalized.split(":");
    if (parts.length !== 8) return null;
    const hextets: number[] = [];
    for (const hex of parts) {
      if (!HEXTET_RE.test(hex)) return null;
      hextets.push(Number.parseInt(hex, 16));
    }
    return hextets;
  }

  // Has :: — can appear only once
  if (normalized.indexOf("::", doubleColonIndex + 2) !== -1) return null;

  const left = normalized.substring(0, doubleColonIndex);
  const right = normalized.substring(doubleColonIndex + 2);

  const hextets: number[] = [];
  if (left) {
    for (const hex of left.split(":")) {
      if (!HEXTET_RE.test(hex)) return null;
      hextets.push(Number.parseInt(hex, 16));
    }
  }

  const rightHextets: number[] = [];
  if (right) {
    for (const hex of right.split(":")) {
      if (!HEXTET_RE.test(hex)) return null;
      rightHextets.push(Number.parseInt(hex, 16));
    }
  }

  // `::` must stand for AT LEAST one zero group, so the explicit hextets must
  // total fewer than 8.
  if (hextets.length + rightHextets.length >= 8) return null;

  const zeroCount = 8 - hextets.length - rightHextets.length;
  for (let i = 0; i < zeroCount; i++) hextets.push(0);
  hextets.push(...rightHextets);
  return hextets.length === 8 ? hextets : null;
}

function isForbiddenIPv6(ip: string): boolean {
  // Parse first, classify on numbers only — no string-shape special cases, so
  // a non-canonical spelling (0:0:0:0:0:ffff:7f00:1) classifies identically to
  // its canonical form.
  const hextets = parseIPv6ToHextets(ip.toLowerCase());
  if (!hextets) return true; // unparseable -> fail closed

  // Under `noUncheckedIndexedAccess` an index read is `number | undefined`;
  // check explicitly and FAIL CLOSED if any slot is missing rather than
  // asserting the invariant away.
  const [h0, h1, h2, h3, h4, h5, h6, h7] = hextets;
  if (
    h0 === undefined ||
    h1 === undefined ||
    h2 === undefined ||
    h3 === undefined ||
    h4 === undefined ||
    h5 === undefined ||
    h6 === undefined ||
    h7 === undefined
  ) {
    return true; // malformed hextet array -> fail closed
  }

  const embeddedIPv4 = (hi: number, lo: number): string =>
    `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;

  const topSixZero = h0 === 0 && h1 === 0 && h2 === 0 && h3 === 0 && h4 === 0 && h5 === 0;

  // ::/96 — unspecified (::), loopback (::1) and the deprecated
  // IPv4-COMPATIBLE form (::127.0.0.1, ::10.0.0.1 …). Blocked wholesale: the
  // format is deprecated (RFC 4291 §2.5.5.1) and every use of it against this
  // fetcher is an attempt to smuggle an IPv4 target past an IPv6 check.
  if (topSixZero) return true;

  // ::ffff:0:0/96 — IPv4-mapped. Classify the embedded IPv4.
  if (h0 === 0 && h1 === 0 && h2 === 0 && h3 === 0 && h4 === 0 && h5 === 0xffff) {
    return isForbiddenIPv4(embeddedIPv4(h6, h7));
  }

  // 64:ff9b::/96 (RFC 6052 well-known NAT64) and 64:ff9b:1::/48 (RFC 8215
  // local-use NAT64). THE live risk: on an IPv6-only subnet with DNS64/NAT64 —
  // a supported, common cloud configuration — 64:ff9b::169.254.169.254 is
  // translated to 169.254.169.254, i.e. a full IMDS read from a vendor-supplied
  // field. Blocked wholesale rather than "only if the embedded IPv4 is
  // private": a NAT64 literal is never a legitimate public calendar host, and
  // the translating prefix in use is not knowable from inside this process.
  if (h0 === 0x0064 && h1 === 0xff9b) return true;

  // 2002::/16 — 6to4 (embeds an IPv4 in h1:h2). Deprecated by RFC 7526.
  if (h0 === 0x2002) return true;

  // 2001::/32 — Teredo (embeds an IPv4 server + a masked client IPv4).
  if (h0 === 0x2001 && h1 === 0x0000) return true;

  // 100::/64 — discard-only (RFC 6666).
  if (h0 === 0x0100 && h1 === 0 && h2 === 0 && h3 === 0) return true;

  // fe80::/10 link-local: matches 0xfe80-0xfebf.
  if ((h0 & 0xffc0) === 0xfe80) return true;

  // fc00::/7 unique-local: matches 0xfc00-0xfdff.
  if ((h0 & 0xfe00) === 0xfc00) return true;

  // ff00::/8 multicast.
  if ((h0 & 0xff00) === 0xff00) return true;

  return false;
}

/**
 * PURE, unit-testable: is this resolved address (IPv4 or IPv6 literal, as
 * returned by `dns.lookup`) private/reserved/loopback/link-local/metadata?
 * Fails closed (returns true) on anything `node:net.isIP` can't classify.
 */
export function isForbiddenAddress(ip: string): boolean {
  const version = net.isIP(ip);
  if (version === 4) return isForbiddenIPv4(ip);
  if (version === 6) return isForbiddenIPv6(ip);
  return true;
}

/**
 * Scheme + hostname + resolved-address validation for a vendor-supplied iCal
 * URL. Throws `UnsafeIcalUrlError` (never a raw DNS/network error) if the URL
 * is disallowed. Used both by the PUT /manage/.../calendar-subscription route
 * (best-effort, immediate 400) and by the poller (authoritative, before every
 * fetch and every redirect hop).
 */
export async function assertSafeIcalUrl(urlStr: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(urlStr);
  } catch {
    throw new UnsafeIcalUrlError("invalid_url");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeIcalUrlError("bad_protocol");
  }

  // Credentials in the URL are never needed by a real feed and are a classic
  // way to smuggle a different authority past eyeball review
  // ("https://feed.example.com@169.254.169.254/").
  if (url.username || url.password) {
    throw new UnsafeIcalUrlError("credentials_in_url");
  }

  if (!ALLOWED_PORTS.has(url.port)) {
    throw new UnsafeIcalUrlError("bad_port");
  }

  // Strip IPv6-literal brackets ("[::1]" -> "::1") and the FQDN root dot
  // ("localhost." resolves exactly like "localhost", so it must not dodge the
  // literal-hostname list below).
  const hostname = url.hostname
    .replace(/^\[|\]$/g, "")
    .replace(/\.+$/, "")
    .toLowerCase();
  if (!hostname) throw new UnsafeIcalUrlError("blocked_hostname");
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".localdomain")
  ) {
    throw new UnsafeIcalUrlError("blocked_hostname");
  }

  // Alternate IPv4 encodings. `net.isIP` rejects "2130706433" / "0x7f000001" /
  // "0177.0.0.1", so without this they'd fall through to `dns.lookup`, which
  // (via getaddrinfo) DOES accept them and hands back 127.0.0.1 — the address
  // checks below would never run on a value that never looked like an IP.
  // Anything that is all-numeric/hex but not a valid dotted quad is refused.
  if (net.isIP(hostname) === 0 && /^[0-9a-fx.]+$/.test(hostname) && /\d/.test(hostname)) {
    throw new UnsafeIcalUrlError("numeric_hostname");
  }

  let addresses: string[];
  if (net.isIP(hostname)) {
    addresses = [hostname];
  } else {
    try {
      const records = await dns.lookup(hostname, { all: true });
      addresses = records.map((r) => r.address);
    } catch {
      throw new UnsafeIcalUrlError("dns_resolution_failed");
    }
  }
  if (addresses.length === 0) {
    throw new UnsafeIcalUrlError("dns_resolution_failed");
  }
  for (const ip of addresses) {
    if (isForbiddenAddress(ip)) {
      throw new UnsafeIcalUrlError("private_address");
    }
  }
}

function classifyThrown(err: unknown): IcalFetchError {
  if (err instanceof IcalFetchError) return err;
  if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
    return new IcalFetchError("timeout");
  }
  return new IcalFetchError("fetch failed");
}

export interface FetchIcalOptions {
  timeoutMs: number;
  maxBytes: number;
}

/**
 * Guarded fetch for a vendor iCal feed: validates the URL (scheme + resolved
 * address) before every request, follows redirects manually (max 3 hops,
 * re-validating the `Location` each time), and reads the body incrementally
 * so an oversize/hostile response is aborted mid-stream instead of buffered
 * in full before the size check runs (review finding I-2).
 */
export async function fetchIcalFeedSafely(
  url: string,
  fetchImpl: FetchLike,
  opts: FetchIcalOptions,
  redirectCount = 0,
): Promise<string> {
  if (redirectCount >= MAX_REDIRECTS) {
    throw new IcalFetchError("too many redirects");
  }

  try {
    await assertSafeIcalUrl(url);
  } catch {
    throw new IcalFetchError("invalid or disallowed URL");
  }

  let res: Response;
  try {
    res = await fetchImpl(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(opts.timeoutMs),
    });
  } catch (err) {
    throw classifyThrown(err);
  }

  if (res.status >= 300 && res.status < 400) {
    const loc = res.headers.get("location");
    if (!loc) throw new IcalFetchError("fetch failed: redirect without location");
    let nextUrl: string;
    try {
      nextUrl = new URL(loc, url).toString();
    } catch {
      throw new IcalFetchError("invalid or disallowed URL");
    }
    return fetchIcalFeedSafely(nextUrl, fetchImpl, opts, redirectCount + 1);
  }

  if (!res.ok) {
    throw new IcalFetchError(`fetch failed: HTTP ${res.status}`);
  }

  const contentLengthHeader = res.headers.get("content-length");
  if (contentLengthHeader && Number(contentLengthHeader) > opts.maxBytes) {
    throw new IcalFetchError("feed too large");
  }

  const reader = res.body?.getReader();
  if (!reader) {
    // Some fetch impls (older polyfills / certain test doubles) don't expose
    // a streamable body — fall back to a single read, still capped.
    const text = await res.text();
    if (Buffer.byteLength(text, "utf8") > opts.maxBytes) {
      throw new IcalFetchError("feed too large");
    }
    return text;
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > opts.maxBytes) {
        await reader.cancel().catch(() => {});
        throw new IcalFetchError("feed too large");
      }
      chunks.push(value);
    }
  } catch (err) {
    throw classifyThrown(err);
  }

  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(combined);
}
