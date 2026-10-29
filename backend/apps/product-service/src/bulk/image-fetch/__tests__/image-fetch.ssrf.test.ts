import { describe, expect, test } from "bun:test";
import { assertSafeUrl } from "../image-fetch.ssrf.ts";

describe("assertSafeUrl", () => {
  test.each([
    ["http://localhost/a", "localhost"],
    ["http://127.0.0.1/a", "private"],
    ["http://10.0.0.5/a", "private"],
    ["http://192.168.1.1/a", "private"],
    ["http://172.16.0.1/a", "private"],
    ["http://169.254.169.254/latest/meta-data/", "metadata"],
    ["http://[::1]/a", "private"],
    ["ftp://example.com/img.jpg", "bad_protocol"],
    ["http://example.com:22/", "bad_port"],
  ])("blocks %s", async (url, expectedPrefix) => {
    await expect(assertSafeUrl(url)).rejects.toMatchObject({
      reason: expect.stringContaining(expectedPrefix),
    });
  });

  test("allows public IP literal (no DNS)", async () => {
    // 1.1.1.1 is Cloudflare's public DNS — guaranteed public, zero DNS resolution.
    await expect(assertSafeUrl("https://1.1.1.1/image.jpg")).resolves.toBeUndefined();
  });
});
