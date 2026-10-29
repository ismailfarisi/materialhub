import { act, render, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock cookies-next/client BEFORE importing the modules under test so the
// vi.mock factory captures the in-memory store.
const cookieStore: Record<string, string> = {};

vi.mock("cookies-next/client", () => ({
  getCookie: (key: string) => cookieStore[key],
  setCookie: (key: string, value: string) => {
    cookieStore[key] = value;
  },
  deleteCookie: (key: string) => {
    delete cookieStore[key];
  },
}));

// eslint-disable-next-line import/first
import {
  readConsentCookie,
  writeConsentCookie,
} from "../consent-cookie";
// eslint-disable-next-line import/first
import {
  ConsentProvider,
  hasConsent,
  useConsent,
} from "../consent-state";

function wrapper({ children }: { children: ReactNode }) {
  return <ConsentProvider>{children}</ConsentProvider>;
}

beforeEach(() => {
  for (const k of Object.keys(cookieStore)) delete cookieStore[k];
});

afterEach(() => {
  for (const k of Object.keys(cookieStore)) delete cookieStore[k];
});

describe("consent-cookie", () => {
  it("readConsentCookie returns null when no cookie set", () => {
    expect(readConsentCookie()).toBeNull();
  });

  it("readConsentCookie returns 'accepted' when cookie equals accepted", () => {
    writeConsentCookie("accepted");
    expect(readConsentCookie()).toBe("accepted");
  });

  it("readConsentCookie returns 'rejected' when cookie equals rejected", () => {
    writeConsentCookie("rejected");
    expect(readConsentCookie()).toBe("rejected");
  });

  it("readConsentCookie returns null when cookie holds an unknown value", () => {
    cookieStore.materialhub_consent = "maybe";
    expect(readConsentCookie()).toBeNull();
  });
});

describe("hasConsent", () => {
  it("returns true only for 'accepted'", () => {
    expect(hasConsent("accepted")).toBe(true);
    expect(hasConsent("rejected")).toBe(false);
    expect(hasConsent(null)).toBe(false);
  });
});

describe("ConsentProvider + useConsent", () => {
  it("initialises decision from the cookie on mount", async () => {
    cookieStore.materialhub_consent = "accepted";
    const { result } = renderHook(() => useConsent(), { wrapper });
    // useEffect-driven read; flush microtasks.
    await act(async () => {});
    expect(result.current.decision).toBe("accepted");
  });

  it("starts with null when no cookie present", async () => {
    const { result } = renderHook(() => useConsent(), { wrapper });
    await act(async () => {});
    expect(result.current.decision).toBeNull();
  });

  it("setDecision writes the cookie and updates state", async () => {
    const { result } = renderHook(() => useConsent(), { wrapper });
    await act(async () => {});

    act(() => result.current.setDecision("accepted"));
    expect(result.current.decision).toBe("accepted");
    expect(cookieStore.materialhub_consent).toBe("accepted");

    act(() => result.current.setDecision("rejected"));
    expect(result.current.decision).toBe("rejected");
    expect(cookieStore.materialhub_consent).toBe("rejected");
  });

  it("throws when useConsent is called outside the provider", () => {
    // Suppress React's error boundary noise for this expected throw.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    function Probe() {
      useConsent();
      return null;
    }
    expect(() => render(<Probe />)).toThrow(/ConsentProvider missing/);
    spy.mockRestore();
  });

  it("exposes the decision to consuming children", async () => {
    cookieStore.materialhub_consent = "rejected";
    function Probe() {
      const { decision } = useConsent();
      return <span data-testid="d">{decision ?? "none"}</span>;
    }
    render(
      <ConsentProvider>
        <Probe />
      </ConsentProvider>,
    );
    await act(async () => {});
    expect(screen.getByTestId("d").textContent).toBe("rejected");
  });
});
