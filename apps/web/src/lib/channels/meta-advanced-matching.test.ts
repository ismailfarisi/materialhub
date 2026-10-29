import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the useMe hook before the SUT imports it.
let mockMe: {
  email?: string;
  phone?: string;
  first_name?: string;
  last_name?: string;
  city?: string;
  id?: string;
} | null = null;
let mockMeLoading = false;

vi.mock("@/lib/queries/auth", () => ({
  useMe: (_enabled?: boolean) => ({
    data: mockMe,
    isLoading: mockMeLoading,
  }),
}));

import { useMetaAdvancedMatching } from "./meta-advanced-matching";

beforeEach(() => {
  mockMe = null;
  mockMeLoading = false;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("useMetaAdvancedMatching", () => {
  it("returns null when the user is not signed in", () => {
    mockMe = null;
    const { result } = renderHook(() => useMetaAdvancedMatching());
    expect(result.current).toBeNull();
  });

  it("returns null while useMe is loading", () => {
    mockMeLoading = true;
    const { result } = renderHook(() => useMetaAdvancedMatching());
    expect(result.current).toBeNull();
  });

  it("returns the AM object for a signed-in user with lowercase email + E.164 phone", () => {
    mockMe = {
      id: "user-7",
      email: " Test@Example.COM ",
      phone: "050-123-4567",
      first_name: "Aisha",
      last_name: "Khan",
      city: "Dubai",
    };
    const { result } = renderHook(() => useMetaAdvancedMatching());
    expect(result.current).toEqual({
      em: "test@example.com",
      ph: "+971501234567",
      fn: "aisha",
      ln: "khan",
      ct: "dubai",
      country: "ae",
      external_id: "user-7",
    });
  });

  it("omits optional fields when source values are missing", () => {
    mockMe = { id: "user-7", email: "a@b.com" };
    const { result } = renderHook(() => useMetaAdvancedMatching());
    expect(result.current).toEqual({
      em: "a@b.com",
      country: "ae",
      external_id: "user-7",
    });
  });
});
