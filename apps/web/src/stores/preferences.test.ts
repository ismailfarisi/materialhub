import { describe, expect, it } from "vitest";
import { usePreferencesStore } from "./preferences";

describe("usePreferencesStore", () => {
  it("keeps locale limited to English and Arabic", () => {
    usePreferencesStore.getState().setLocale("hi");

    expect(usePreferencesStore.getState().locale).toBe("en");
  });

  it("keeps currency fixed to AED", () => {
    usePreferencesStore.getState().setCurrency("USD");

    expect(usePreferencesStore.getState().currency).toBe("AED");
  });
});
