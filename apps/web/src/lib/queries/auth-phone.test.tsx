import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { api } from "../api";
import { useStartPhoneAuth } from "./auth";

vi.mock("../api", () => ({
  api: {
    post: vi.fn(async () => ({ data: { data: { phone: "+971501234567" } } })),
  },
  clearGuestSessionToken: vi.fn(),
  getGuestSessionToken: vi.fn(() => null),
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("phone auth queries", () => {
  test("starts phone auth with the entered phone", async () => {
    const { result } = renderHook(() => useStartPhoneAuth(), { wrapper });

    result.current.mutate("+971501234567");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.phone).toBe("+971501234567");
    expect(api.post).toHaveBeenCalledWith("/auth/phone/start", { phone: "+971501234567" });
  });
});
