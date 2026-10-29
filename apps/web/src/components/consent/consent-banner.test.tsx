import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => `consent.${key}`,
}));

// eslint-disable-next-line import/first
import { ConsentProvider } from "@/lib/consent/consent-state";
// eslint-disable-next-line import/first
import { ConsentBanner } from "./consent-banner";

beforeEach(() => {
  for (const k of Object.keys(cookieStore)) delete cookieStore[k];
});

afterEach(() => {
  for (const k of Object.keys(cookieStore)) delete cookieStore[k];
});

function renderBanner() {
  return render(
    <ConsentProvider>
      <ConsentBanner />
    </ConsentProvider>,
  );
}

describe("ConsentBanner", () => {
  it("is visible when no cookie is set", async () => {
    renderBanner();
    await act(async () => {});
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("consent.title")).toBeInTheDocument();
    expect(screen.getByText("consent.accept")).toBeInTheDocument();
    expect(screen.getByText("consent.reject")).toBeInTheDocument();
  });

  it("is not rendered when the cookie is already 'accepted'", async () => {
    cookieStore.materialhub_consent = "accepted";
    renderBanner();
    await act(async () => {});
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("is not rendered when the cookie is already 'rejected'", async () => {
    cookieStore.materialhub_consent = "rejected";
    renderBanner();
    await act(async () => {});
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("hides itself and writes the cookie on Accept", async () => {
    renderBanner();
    await act(async () => {});
    await act(async () => {
      fireEvent.click(screen.getByText("consent.accept"));
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(cookieStore.materialhub_consent).toBe("accepted");
  });

  it("hides itself and writes the cookie on Reject", async () => {
    renderBanner();
    await act(async () => {});
    await act(async () => {
      fireEvent.click(screen.getByText("consent.reject"));
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(cookieStore.materialhub_consent).toBe("rejected");
  });
});
