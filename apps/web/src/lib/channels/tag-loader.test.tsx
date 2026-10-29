import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let mockDecision: "accepted" | "rejected" | null = "accepted";
vi.mock("@/lib/consent/consent-state", () => ({
  useConsent: () => ({ decision: mockDecision, setDecision: vi.fn() }),
  hasConsent: (d: string | null) => d === "accepted",
}));

let mockMe: { id: string; email?: string; phone?: string } | null = null;
vi.mock("@/lib/queries/auth", () => ({
  useMe: () => ({ data: mockMe, isLoading: false }),
}));

const registerSpy = vi.fn();
const buildGoogleSpy = vi.fn((args) => ({ id: "google", fire: vi.fn(), ...args }));
const buildMetaSpy = vi.fn((args) => ({ id: "meta", fire: vi.fn(), ...args }));
const buildTikTokSpy = vi.fn((args) => ({ id: "tiktok", fire: vi.fn(), ...args }));
const registeredChannels: Array<{ id: string; scriptSrc?: string; scriptInit?: string }> = [];

vi.mock("./registry", () => ({
  registerChannel: (c: { id: string; scriptSrc?: string; scriptInit?: string }) => {
    registerSpy(c);
    if (!registeredChannels.find((x) => x.id === c.id)) registeredChannels.push(c);
  },
  getRegisteredChannels: () => [...registeredChannels],
  buildGoogleChannel: (args: unknown) => buildGoogleSpy(args),
  buildMetaChannel: (args: unknown) => buildMetaSpy(args),
  buildTikTokChannel: (args: unknown) => buildTikTokSpy(args),
}));

// Explicit Meta AM mock for symmetry with the TikTok mock below. Derives from
// `mockMe` so the existing "threads advancedMatching from useMe" test still
// observes the real-world shape (em / external_id) — without this, the hook
// would silently break if meta-advanced-matching.ts grew new upstream imports.
vi.mock("./meta-advanced-matching", () => ({
  useMetaAdvancedMatching: () => {
    if (!mockMe) return null;
    const am: {
      country: string;
      external_id: string;
      em?: string;
      ph?: string;
    } = { country: "ae", external_id: mockMe.id };
    if (mockMe.email) am.em = mockMe.email.trim().toLowerCase();
    if (mockMe.phone) am.ph = mockMe.phone;
    return am;
  },
}));

let mockTikTokAm: { email?: string; phone_number?: string; external_id?: string } | null = null;
vi.mock("./tiktok-advanced-matching", () => ({
  useTikTokAdvancedMatching: () => mockTikTokAm,
}));

import { TagLoader } from "./tag-loader";

beforeEach(() => {
  mockDecision = "accepted";
  mockMe = null;
  mockTikTokAm = null;
  registerSpy.mockClear();
  buildGoogleSpy.mockClear();
  buildMetaSpy.mockClear();
  buildTikTokSpy.mockClear();
  registeredChannels.length = 0;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("TagLoader", () => {
  it("does NOT register Meta when metaPixelId is undefined", () => {
    render(
      <TagLoader
        googleGtagId="G-X"
        googleConversionId="AW-Y/Z"
        metaPixelId={undefined}
        tiktokPixelCode={undefined}
      />,
    );
    expect(buildMetaSpy).not.toHaveBeenCalled();
    expect(registeredChannels.find((c) => c.id === "meta")).toBeUndefined();
  });

  it("registers Meta when metaPixelId is set", () => {
    render(
      <TagLoader
        googleGtagId="G-X"
        googleConversionId="AW-Y/Z"
        metaPixelId="111"
        tiktokPixelCode={undefined}
      />,
    );
    expect(buildMetaSpy).toHaveBeenCalledTimes(1);
    expect(buildMetaSpy).toHaveBeenCalledWith(
      expect.objectContaining({ pixelId: "111" }),
    );
    expect(registeredChannels.find((c) => c.id === "meta")).toBeDefined();
  });

  it("returns null (renders no <Script>) when consent is rejected, even if channels are registered", () => {
    mockDecision = "rejected";
    const { container } = render(
      <TagLoader
        googleGtagId="G-X"
        googleConversionId="AW-Y/Z"
        metaPixelId="111"
        tiktokPixelCode={undefined}
      />,
    );
    // Channels still register on mount via useEffect (idempotent), but the
    // component returns null when consent is rejected — no <Script> emitted.
    expect(container.firstChild).toBeNull();
  });

  it("threads advancedMatching from useMe into buildMetaChannel when user is signed in", () => {
    mockMe = {
      id: "user-7",
      email: "test@example.com",
      phone: "+971501234567",
    };
    render(
      <TagLoader
        googleGtagId="G-X"
        googleConversionId="AW-Y/Z"
        metaPixelId="111"
        tiktokPixelCode={undefined}
      />,
    );
    expect(buildMetaSpy).toHaveBeenCalledTimes(1);
    const call = buildMetaSpy.mock.calls[0]![0] as {
      pixelId: string;
      advancedMatching: { em?: string; external_id?: string } | null;
    };
    expect(call.advancedMatching).not.toBeNull();
    expect(call.advancedMatching!.em).toBe("test@example.com");
    expect(call.advancedMatching!.external_id).toBe("user-7");
  });

  it("does NOT register TikTok when tiktokPixelCode is undefined", () => {
    render(
      <TagLoader
        googleGtagId="G-X"
        googleConversionId="AW-Y/Z"
        metaPixelId={undefined}
        tiktokPixelCode={undefined}
      />,
    );
    expect(buildTikTokSpy).not.toHaveBeenCalled();
    expect(registeredChannels.find((c) => c.id === "tiktok")).toBeUndefined();
  });

  it("registers TikTok when tiktokPixelCode is set", () => {
    render(
      <TagLoader
        googleGtagId="G-X"
        googleConversionId="AW-Y/Z"
        metaPixelId={undefined}
        tiktokPixelCode="CK2XXXXXXXXXXXXXXXXXXXXX"
      />,
    );
    expect(buildTikTokSpy).toHaveBeenCalledTimes(1);
    expect(buildTikTokSpy).toHaveBeenCalledWith(
      expect.objectContaining({ pixelCode: "CK2XXXXXXXXXXXXXXXXXXXXX" }),
    );
    expect(registeredChannels.find((c) => c.id === "tiktok")).toBeDefined();
  });

  it("does NOT emit <Script> tags when consent is rejected, even if tiktokPixelCode is set", () => {
    mockDecision = "rejected";
    const { container } = render(
      <TagLoader
        googleGtagId="G-X"
        googleConversionId="AW-Y/Z"
        metaPixelId={undefined}
        tiktokPixelCode="CK2XXXXXXXXXXXXXXXXXXXXX"
      />,
    );
    // Channel still registers on mount (useEffect is idempotent and fires
    // independently of consent), but the component returns null so no
    // <Script> blocks reach the DOM — mirrors Meta's consent-gate test above.
    expect(container.firstChild).toBeNull();
  });

  it("threads TikTok advanced matching from useTikTokAdvancedMatching into buildTikTokChannel", () => {
    mockTikTokAm = {
      email: "buyer@example.com",
      phone_number: "+971501234567",
      external_id: "user-7",
    };
    render(
      <TagLoader
        googleGtagId="G-X"
        googleConversionId="AW-Y/Z"
        metaPixelId={undefined}
        tiktokPixelCode="CK2XXXXXXXXXXXXXXXXXXXXX"
      />,
    );
    expect(buildTikTokSpy).toHaveBeenCalledTimes(1);
    const call = buildTikTokSpy.mock.calls[0]![0] as {
      pixelCode: string;
      advancedMatching: { email?: string; phone_number?: string; external_id?: string } | null;
    };
    expect(call.advancedMatching).not.toBeNull();
    expect(call.advancedMatching!.email).toBe("buyer@example.com");
    expect(call.advancedMatching!.phone_number).toBe("+971501234567");
    expect(call.advancedMatching!.external_id).toBe("user-7");
  });
});
