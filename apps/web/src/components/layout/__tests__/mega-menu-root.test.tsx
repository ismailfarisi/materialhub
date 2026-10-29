import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { NavTab } from "@/lib/api/navigation";
import { MegaMenuRoot } from "../mega-menu-root";

vi.useFakeTimers();

const tab: NavTab = {
  id: "t1",
  kind: "category",
  label: "Makeup",
  href: "/c/makeup",
  subcategories: [{ label: "Lipstick", href: "/c/lipstick" }],
  brand_list: { title: "Brands", see_all_href: "/brands", brands: [] },
  promo_tiles: [],
};

describe("MegaMenuRoot", () => {
  it("opens panel after 100ms on tab hover", async () => {
    document.body.innerHTML = `<div><a data-mega-tab-trigger data-tab-id="t1" href="/c/makeup">Makeup</a></div>`;
    render(<MegaMenuRoot tabs={[tab]} />);
    const trigger = document.querySelector("[data-mega-tab-trigger]")!;
    fireEvent.mouseEnter(trigger);
    expect(screen.queryByText("Lipstick")).not.toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(110);
    });
    expect(screen.getByText("Lipstick")).toBeInTheDocument();
  });

  it("closes panel on Escape", async () => {
    document.body.innerHTML = `<div><a data-mega-tab-trigger data-tab-id="t1" href="/c/makeup">Makeup</a></div>`;
    render(<MegaMenuRoot tabs={[tab]} />);
    fireEvent.mouseEnter(document.querySelector("[data-mega-tab-trigger]")!);
    await act(async () => {
      vi.advanceTimersByTime(110);
    });
    expect(screen.getByText("Lipstick")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("Lipstick")).not.toBeInTheDocument();
  });
});
