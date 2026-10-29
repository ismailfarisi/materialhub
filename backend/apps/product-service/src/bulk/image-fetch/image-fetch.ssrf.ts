import dns from "node:dns/promises";
import net from "node:net";

export class UnsafeUrlError extends Error {
  constructor(public readonly reason: string) {
    super(`unsafe_url:${reason}`);
  }
}

const ALLOWED_PORTS = new Set([80, 443]);

function isPrivateIp(ip: string): boolean {
  if (ip === "::1" || ip === "127.0.0.1") return true;
  if (ip.startsWith("169.254.")) return false; // handled separately for metadata
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) {
    // IPv6 — permissive; check loopback/link-local/unique-local
    return (
      ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe8") || ip.startsWith("::1")
    );
  }
  const [a, b] = parts as [number, number];
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

export async function assertSafeUrl(urlStr: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(urlStr);
  } catch {
    throw new UnsafeUrlError("invalid_url");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError("bad_protocol");
  }
  if (url.hostname === "localhost" || url.hostname === "localhost.localdomain") {
    throw new UnsafeUrlError("localhost_blocked");
  }
  const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
  if (!ALLOWED_PORTS.has(port)) throw new UnsafeUrlError("bad_port");

  // Strip brackets from IPv6 literal hostnames (e.g. "[::1]" -> "::1")
  const hostname = url.hostname.replace(/^\[|\]$/g, "");

  // Metadata endpoint check BEFORE DNS resolution
  if (hostname.startsWith("169.254.") || hostname === "metadata.google.internal") {
    throw new UnsafeUrlError("metadata_endpoint");
  }

  // Resolve and check every A/AAAA record
  let addresses: string[] = [];
  if (net.isIP(hostname)) {
    addresses = [hostname];
  } else {
    try {
      const lookup = await dns.lookup(hostname, { all: true });
      addresses = lookup.map((r) => r.address);
    } catch (err) {
      throw new UnsafeUrlError(`dns_failed:${(err as Error).message}`);
    }
  }
  for (const ip of addresses) {
    if (ip.startsWith("169.254.")) throw new UnsafeUrlError("metadata_endpoint");
    if (isPrivateIp(ip)) throw new UnsafeUrlError("private_ip");
  }
}
