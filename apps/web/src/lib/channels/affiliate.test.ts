import { beforeEach, describe, expect, it, vi } from "vitest";

const postMock = vi.fn().mockResolvedValue({ data: {} });
const ensureGuestSessionTokenMock = vi.fn().mockResolvedValue(null);

vi.mock("@/lib/api", () => ({
  api: { post: (...args: unknown[]) => postMock(...args) },
  ensureGuestSessionToken: (...args: unknown[]) => ensureGuestSessionTokenMock(...args),
}));

import { captureAffiliateRef } from "./affiliate";

const COOKIE = "nl_aff";

function setLocation(href: string): void {
  Object.defineProperty(window, "location", {
    value: new URL(href),
    writable: true,
    configurable: true,
  });
}

function setCookie(value: string): void {
  Object.defineProperty(document, "cookie", {
    value,
    writable: true,
    configurable: true,
  });
}

describe("captureAffiliateRef", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setCookie("");
    setLocation("https://materialhub.example/");
  });

  it("posts the code to /a/track and /cart/affiliate when ?aff is present", async () => {
    setLocation("https://materialhub.example/?aff=AFF-ABC12345");
    await captureAffiliateRef();

    expect(ensureGuestSessionTokenMock).toHaveBeenCalled();
    expect(postMock).toHaveBeenCalledWith("/a/track", {
      code: "AFF-ABC12345",
    });
    expect(postMock).toHaveBeenCalledWith("/cart/affiliate", {
      code: "AFF-ABC12345",
    });
  });

  it("falls back to the persisted nl_aff cookie when the URL has no ?aff", async () => {
    setCookie(`${COOKIE}=AFF-COOKIE99`);
    setLocation("https://materialhub.example/some-page");
    await captureAffiliateRef();

    expect(postMock).toHaveBeenCalledWith("/a/track", {
      code: "AFF-COOKIE99",
    });
    expect(postMock).toHaveBeenCalledWith("/cart/affiliate", {
      code: "AFF-COOKIE99",
    });
  });

  it("does not POST when there is no code in the query or cookie", async () => {
    setLocation("https://materialhub.example/?utm_source=foo");
    await captureAffiliateRef();

    expect(postMock).not.toHaveBeenCalled();
    expect(ensureGuestSessionTokenMock).not.toHaveBeenCalled();
  });
});
