import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ServiceFilterSidebar } from "./service-filter-sidebar";

const replace = vi.fn();
// STABLE instances — see filter-sidebar.test.tsx. A fresh URLSearchParams per
// call gives a new identity every render; any effect keyed on it re-fires
// forever and crashes the vitest worker, wedging the whole run.
const emptyParams = new URLSearchParams("");
const pagedParams = new URLSearchParams("area=dubai-marina&page=2");
let currentParams = emptyParams;
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => currentParams,
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const config = {
  areas: [{ value: "dubai-marina", label: "Dubai Marina", count: 3 }],
  categories: [{ value: "hair", label: "Hair", count: 2 }],
  priceRange: { min: 0, max: 100000 },
};

describe("ServiceFilterSidebar", () => {
  it("commits an area selection to the URL", () => {
    currentParams = emptyParams;
    replace.mockClear();
    render(<ServiceFilterSidebar config={config} />);
    fireEvent.click(screen.getByLabelText("Dubai Marina"));
    expect(replace).toHaveBeenCalledWith(
      expect.stringContaining("area=dubai-marina"),
      { scroll: false },
    );
  });

  it("commits a visit-type selection", () => {
    currentParams = emptyParams;
    replace.mockClear();
    render(<ServiceFilterSidebar config={config} />);
    fireEvent.click(screen.getByLabelText("visitHomeVisit"));
    expect(replace).toHaveBeenCalledWith(
      expect.stringContaining("visit=home_visit"),
      { scroll: false },
    );
  });

  it("resets to ? on clear all", () => {
    currentParams = emptyParams;
    replace.mockClear();
    render(<ServiceFilterSidebar config={config} />);
    fireEvent.click(screen.getByText("clearAll"));
    expect(replace).toHaveBeenCalledWith("?", { scroll: false });
  });

  it("drops the page param when a filter changes", () => {
    currentParams = pagedParams; // area=dubai-marina&page=2
    replace.mockClear();
    render(<ServiceFilterSidebar config={config} />);
    // Toggle visit checkbox (adding a new filter while area is preserved)
    fireEvent.click(screen.getByLabelText("visitHomeVisit"));
    const callUrl = replace.mock.calls[0][0] as string;
    expect(callUrl).not.toContain("page=");
    expect(callUrl).toContain("area=dubai-marina");
    expect(callUrl).toContain("visit=home_visit");
  });

  it("hides a facet group that has no values rather than rendering it empty", () => {
    currentParams = emptyParams;
    render(<ServiceFilterSidebar config={{ ...config, categories: [] }} />);
    expect(screen.queryByText("category")).toBeNull();
  });

  it("renders a labelled complementary landmark", () => {
    currentParams = emptyParams;
    render(<ServiceFilterSidebar config={config} />);
    expect(screen.getByRole("complementary", { name: /filters/i })).toBeInTheDocument();
  });
});
