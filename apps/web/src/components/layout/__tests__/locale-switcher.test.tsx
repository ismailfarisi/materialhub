import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LocaleSwitcher } from "../locale-switcher";

vi.mock("next-intl", () => ({
  useLocale: () => "en",
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/en/products",
  useRouter: () => ({ replace: vi.fn() }),
}));

describe("LocaleSwitcher", () => {
  it("only renders English and Arabic options", () => {
    render(<LocaleSwitcher />);

    const options = within(screen.getByRole("combobox")).getAllByRole("option");

    expect(options.map((option) => option.getAttribute("value"))).toEqual(["en", "ar"]);
    expect(options.map((option) => option.textContent)).toEqual(["EN", "AR"]);
  });
});

describe("LocaleSwitcher path handling", () => {
  it("swaps only the leading locale segment", async () => {
    const replace = vi.fn();
    vi.resetModules();
    vi.doMock("next-intl", () => ({ useLocale: () => "en" }));
    vi.doMock("next/navigation", () => ({
      usePathname: () => "/en/c/papers-boards/en-route",
      useRouter: () => ({ replace }),
    }));
    const { LocaleSwitcher: Fresh } = await import("../locale-switcher");
    const { fireEvent } = await import("@testing-library/react");
    render(<Fresh />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "ar" } });
    expect(replace).toHaveBeenCalledWith("/ar/c/papers-boards/en-route");
  });
});
