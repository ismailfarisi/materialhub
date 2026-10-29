import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CurrencySelector } from "../currency-selector";

describe("CurrencySelector", () => {
  it("only renders AED as a selectable currency", () => {
    render(<CurrencySelector />);

    const options = within(screen.getByRole("combobox")).getAllByRole("option");

    expect(options.map((option) => option.getAttribute("value"))).toEqual(["AED"]);
    expect(screen.queryByText(/USD/)).not.toBeInTheDocument();
  });
});
