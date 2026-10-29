import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ServiceCard } from "./service-card";
import type { ServiceListItem } from "../../lib/booking/types";

// Interpolate params into the key so the test can assert on the
// interpolated values (areas, minutes) the customer actually sees, not
// just which translation key was picked. Matches the precedent in
// booking-success.test.tsx.
vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key} ${JSON.stringify(params)}` : key,
}));

vi.mock("next/image", () => ({
  default: ({
    fill: _fill,
    ...props
  }: React.ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean }) => (
    <img {...props} src={props.src as string} alt={props.alt as string} />
  ),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const base: ServiceListItem = {
  id: "o1",
  name: "Balayage",
  slug: "balayage-o1",
  vendor_id: "v1",
  vendor_name: "Glow Studio",
  category_name: "Hair",
  price_fils: 45000,
  duration_minutes: 90,
  location_mode: "at_premises",
  payment_mode: "deposit",
  area_ids: ["a1"],
  area_slugs: ["marina"],
  area_names: ["Dubai Marina"],
  premises_area_ids: ["a1"],
  home_visit_area_ids: [],
  media_urls: ["https://cdn/x.jpg"],
  status: "published",
  created_at: 1751328000,
};

describe("ServiceCard", () => {
  it("links to the singular /service/:slug PDP", () => {
    render(<ServiceCard service={base} />);
    expect(screen.getByRole("link", { name: /balayage/i })).toHaveAttribute(
      "href",
      "/en/service/balayage-o1",
    );
  });

  it("renders the price in AED, not fils", () => {
    render(<ServiceCard service={base} />);
    expect(screen.getByText("450")).toBeInTheDocument();
  });

  it("labels the price with its currency", () => {
    // Without this the card reads "450   60 min" — a bare number with no unit
    // on a public listing. Matches ProductCard's currency + amount pairing.
    render(<ServiceCard service={base} />);
    expect(screen.getByText("AED")).toBeInTheDocument();
  });

  it("renders the duration", () => {
    render(<ServiceCard service={base} />);
    const durationEl = screen.getByText(/duration/, { selector: "span" });
    expect(durationEl.textContent).toBe('duration {"minutes":90}');
  });

  it("labels an at_premises service with its branch areas", () => {
    render(<ServiceCard service={base} />);
    const locationEl = screen.getByTestId("service-location");
    expect(locationEl.textContent).toBe('atPremisesIn {"areas":"Dubai Marina"}');
  });

  it("labels a home_visit service as coming to you", () => {
    render(
      <ServiceCard
        service={{
          ...base,
          location_mode: "home_visit",
          premises_area_ids: [],
          home_visit_area_ids: ["a1"],
        }}
      />,
    );
    const locationEl = screen.getByTestId("service-location");
    expect(locationEl.textContent).toBe('homeVisitIn {"areas":"Dubai Marina"}');
  });

  it("renders no location line when the vendor has no coverage", () => {
    render(
      <ServiceCard
        service={{
          ...base,
          area_ids: [],
          area_names: [],
          area_slugs: [],
          premises_area_ids: [],
          home_visit_area_ids: [],
        }}
      />,
    );
    expect(screen.queryByTestId("service-location")).toBeNull();
  });
});
