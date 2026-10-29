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
    label: "Makeup",
    href: "/c/makeup",
    subcategories: [{ label: "Lipstick", href: "/c/lipstick" }],
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
    expect(screen.getByText("Makeup")).toBeInTheDocument();
    expect(screen.queryByText("Lipstick")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Makeup"));
    expect(screen.getByText("Lipstick")).toBeInTheDocument();
  });

  it("shows core quick links even when tabs are empty", () => {
    renderDrawer({ open: true, onClose: () => {}, tabs: [] });
    expect(screen.getByText("Reels")).toBeInTheDocument();
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
