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
