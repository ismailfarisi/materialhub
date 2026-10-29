import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NavBar } from "../nav-bar";

vi.mock("../mega-menu-root", () => ({
  MegaMenuRoot: ({ tabs }: any) => <div data-testid="mega-root">{tabs.length}</div>,
}));

describe("NavBar", () => {
  it("renders nothing when tabs are empty", () => {
    const { container } = render(<NavBar tabs={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a tab anchor for each tab and forwards to MegaMenuRoot", () => {
    render(
      <NavBar
        tabs={[
          {
            id: "t1",
            kind: "category",
            label: "Makeup",
            href: "/c/makeup",
            subcategories: [],
            brand_list: { title: "x", see_all_href: "/", brands: [] },
            promo_tiles: [],
          },
          {
            id: "t2",
            kind: "custom",
            label: "New",
            href: "/p/new",
            subcategories: [],
            brand_list: { title: "x", see_all_href: "/", brands: [] },
            promo_tiles: [],
          },
        ]}
      />,
    );
    expect(screen.getByText("Makeup")).toBeInTheDocument();
    expect(screen.getByText("New")).toBeInTheDocument();
    expect(screen.getByTestId("mega-root").textContent).toBe("2");
  });
});
