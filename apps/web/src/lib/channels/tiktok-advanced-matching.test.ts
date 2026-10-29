import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the useMe hook before the SUT imports it. Mirrors the pattern used in
// meta-advanced-matching.test.ts (module-level mutable state, not
// vi.fn().mockReturnValue) so both AM hook test files stay structurally
// identical.
let mockMe: {
  id?: string;
  email?: string | null;
  phone?: string | null;
  first_name?: string | null;
  last_name?: string | null;
} | null = null;
let mockMeLoading = false;

vi.mock("@/lib/queries/auth", () => ({
  useMe: (_enabled?: boolean) => ({
    data: mockMe,
    isLoading: mockMeLoading,
  }),
}));

import { useTikTokAdvancedMatching } from "./tiktok-advanced-matching";

beforeEach(() => {
  mockMe = null;
  mockMeLoading = false;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("useTikTokAdvancedMatching", () => {
  it("returns null while auth is loading", () => {
    mockMeLoading = true;
    const { result } = renderHook(() => useTikTokAdvancedMatching());
    expect(result.current).toBeNull();
  });

  it("returns null when user is anonymous (no data)", () => {
    mockMe = null;
    const { result } = renderHook(() => useTikTokAdvancedMatching());
    expect(result.current).toBeNull();
  });

  it("returns full identify shape for a logged-in user", () => {
    mockMe = {
      id: "usr-1",
      email: "Buyer@Example.com",
      phone: "0501234567",
      first_name: "Aaminah",
      last_name: "Khan",
    };
    const { result } = renderHook(() => useTikTokAdvancedMatching());
    expect(result.current).toEqual({
      email: "buyer@example.com",
      phone_number: "+971501234567",
      external_id: "usr-1",
    });
  });

  it("omits email when user.email is null/undefined", () => {
    mockMe = { id: "usr-2", email: null, phone: "+971501234567" };
    const { result } = renderHook(() => useTikTokAdvancedMatching());
    expect(result.current).toEqual({
      phone_number: "+971501234567",
      external_id: "usr-2",
    });
  });

  it("omits phone_number when user.phone is null/undefined", () => {
    mockMe = { id: "usr-3", email: "x@y.com", phone: null };
    const { result } = renderHook(() => useTikTokAdvancedMatching());
    expect(result.current).toEqual({
      email: "x@y.com",
      external_id: "usr-3",
    });
  });
});
