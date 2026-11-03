import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import type { NavTab } from "@/lib/api/navigation";
import messages from "../../../messages/en.json";
import { MobileNavDrawer } from "../mobile-nav-drawer";

function renderDrawer(props: { open: boolean; onClose: () => void; tabs: NavTab[] }) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <MobileNavDrawer {...props} />
    </NextIntlClientProvider>,
  );
}

const tabs: NavTab[] = [
  {
    id: "t1",
    kind: "category",
    label: "Papers & Boards",
    href: "/c/papers-boards",
    subcategories: [{ label: "Art Papers", href: "/c/art-papers" }],
    brand_list: { title: "Brands", see_all_href: "/brands", brands: [] },
    promo_tiles: [],
  },
];

describe("MobileNavDrawer", () => {
  it("returns null when closed", () => {
    const { container } = renderDrawer({ open: false, onClose: () => {}, tabs });
    expect(container).toBeEmptyDOMElement();
  });

  it("renders tab labels when open and expands children on click", () => {
    renderDrawer({ open: true, onClose: () => {}, tabs });
    expect(screen.getByText("Papers & Boards")).toBeInTheDocument();
    expect(screen.queryByText("Art Papers")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Papers & Boards"));
    expect(screen.getByText("Art Papers")).toBeInTheDocument();
  });

  it("shows core quick links even when tabs are empty", () => {
    renderDrawer({ open: true, onClose: () => {}, tabs: [] });
    expect(screen.getByText("Brands")).toBeInTheDocument();
    expect(screen.getByText("Track Order")).toBeInTheDocument();
    expect(screen.getByText("Log In")).toBeInTheDocument();
  });

  it("calls onClose on Escape", () => {
    const onClose = vi.fn();
    renderDrawer({ open: true, onClose, tabs });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
