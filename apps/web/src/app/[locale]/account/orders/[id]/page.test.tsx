import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks ------------------------------------------------------------------
// `useChannelEvents` is the surface under test. We replace it with a vi.fn so
// each test can assert what was fired (and the order-confirmation page does
// not need a real ConsentProvider / TagLoader / registered channels).
const fire = vi.fn();
vi.mock("@/lib/channels/use-channel-events", () => ({
  useChannelEvents: () => ({ fire }),
}));

// `useOrder` is mocked per test via this controllable reference.
const mockOrderResult: {
  current: { data: unknown; isLoading: boolean };
} = { current: { data: undefined, isLoading: true } };
vi.mock("@/lib/queries/orders", () => ({
  useOrder: () => mockOrderResult.current,
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "order-id-1" }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

// next/image needs to render a plain img in jsdom.
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const { src, alt } = props as { src?: string; alt?: string };
    // biome-ignore lint/a11y/useAltText: forwarded
    // biome-ignore lint/performance/noImgElement: test stub
    return <img src={src} alt={alt} />;
  },
}));

vi.mock("next/link", () => ({
  default: ({ children, ...rest }: { children: ReactNode } & Record<string, unknown>) =>
    <a {...rest}>{children}</a>,
}));

// Lightweight stubs for downstream account components so the test focuses on
// the page-level Purchase fire logic and is not coupled to their internals.
vi.mock("@/components/account/order-timeline", () => ({
  OrderTimeline: () => null,
}));
vi.mock("@/components/account/review-form", () => ({
  ReviewForm: () => null,
}));
vi.mock("@/lib/utils", () => ({
  formatPrice: (v: number) => String(v),
  cn: (...c: unknown[]) => c.filter(Boolean).join(" "),
}));

// Import AFTER mocks so vi.mock hoisting takes effect for the page's imports.
import OrderDetailPage from "./page";

function wrap(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

const paidOrder = {
  id: "order-id-1",
  order_number: "NL-1001",
  status: "processing",
  payment_status: "captured" as const,
  subtotal: 12_000,
  discount_total: 0,
  shipping_total: 0,
  tax_total: 600,
  grand_total: 12_600,
  currency: "AED",
  shipping_address: { full_name: "A B", city: "Dubai" },
  vendorOrders: [
    {
      id: "vo-1",
      vendor_order_number: "VO-1",
      status: "processing",
      items: [
        { id: "i1", product_id: "p1", quantity: 2, unit_price: 5_000 },
        { id: "i2", product_id: "p2", quantity: 1, unit_price: 2_000 },
      ],
    },
  ],
  user: { email: "buyer@example.com", phone: "+971500000001" },
};

beforeEach(() => {
  fire.mockClear();
  mockOrderResult.current = { data: undefined, isLoading: true };
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("OrderDetailPage Purchase event", () => {
  it("fires Purchase with the expected payload for a paid (captured) order", () => {
    mockOrderResult.current = { data: paidOrder, isLoading: false };

    render(wrap(<OrderDetailPage />));

    expect(fire).toHaveBeenCalledTimes(1);
    expect(fire).toHaveBeenCalledWith("Purchase", {
      order_id: "order-id-1",
      transaction_id: "order-id-1",
      currency: "AED",
      value_fils: 12_600,
      quantity: 3, // 2 + 1 summed across vendor sub-orders
      customer_email: "buyer@example.com",
      customer_phone: "+971500000001",
    });
  });

  it("also accepts payment_status == 'paid' (forward-compat alias)", () => {
    mockOrderResult.current = {
      data: { ...paidOrder, payment_status: "paid" as const },
      isLoading: false,
    };

    render(wrap(<OrderDetailPage />));
    expect(fire).toHaveBeenCalledTimes(1);
    expect(fire).toHaveBeenCalledWith(
      "Purchase",
      expect.objectContaining({ order_id: "order-id-1" }),
    );
  });

  it("does NOT fire when payment_status is 'pending'", () => {
    mockOrderResult.current = {
      data: { ...paidOrder, payment_status: "pending" as const },
      isLoading: false,
    };

    render(wrap(<OrderDetailPage />));
    expect(fire).not.toHaveBeenCalled();
  });

  it("does NOT fire when payment_status is 'refunded'", () => {
    mockOrderResult.current = {
      data: { ...paidOrder, payment_status: "refunded" as const },
      isLoading: false,
    };

    render(wrap(<OrderDetailPage />));
    expect(fire).not.toHaveBeenCalled();
  });

  it("does NOT fire while the order is still loading", () => {
    mockOrderResult.current = { data: undefined, isLoading: true };

    render(wrap(<OrderDetailPage />));
    expect(fire).not.toHaveBeenCalled();
  });

  it("supports vendor_orders (snake_case) as well as vendorOrders", () => {
    const { vendorOrders: _drop, ...rest } = paidOrder;
    void _drop;
    mockOrderResult.current = {
      data: {
        ...rest,
        vendor_orders: [
          {
            id: "vo-1",
            items: [{ id: "i1", quantity: 5 }],
          },
        ],
      },
      isLoading: false,
    };

    render(wrap(<OrderDetailPage />));
    expect(fire).toHaveBeenCalledTimes(1);
    expect(fire).toHaveBeenCalledWith(
      "Purchase",
      expect.objectContaining({ quantity: 5 }),
    );
  });

  it("is null-safe when user is missing from the order payload", () => {
    const { user: _drop, ...withoutUser } = paidOrder;
    void _drop;
    mockOrderResult.current = { data: withoutUser, isLoading: false };

    render(wrap(<OrderDetailPage />));
    expect(fire).toHaveBeenCalledTimes(1);
    expect(fire).toHaveBeenCalledWith(
      "Purchase",
      expect.objectContaining({
        customer_email: undefined,
        customer_phone: undefined,
      }),
    );
  });
});

describe("OrderDetailPage product links", () => {
  it("links the item image and name to the PDP when a slug is present", () => {
    mockOrderResult.current = {
      data: {
        ...paidOrder,
        vendorOrders: [
          {
            ...paidOrder.vendorOrders[0],
            items: [
              {
                id: "i1",
                product_id: "p1",
                product_name: "Art board, matte 350 gsm",
                product_image_url: "https://cdn.example/art-board.jpg",
                product_slug: "art-board-matte-350",
                quantity: 1,
                unit_price: 5_000,
              },
            ],
          },
        ],
      },
      isLoading: false,
    };

    const { container } = render(wrap(<OrderDetailPage />));
    const links = [...container.querySelectorAll('a[href="/en/product/art-board-matte-350"]')];
    // One on the thumbnail, one on the product name.
    expect(links).toHaveLength(2);
    expect(container.textContent).toContain("Art board, matte 350 gsm");
  });

  it("renders the name as plain text when the product is no longer shoppable", () => {
    mockOrderResult.current = {
      data: {
        ...paidOrder,
        vendorOrders: [
          {
            ...paidOrder.vendorOrders[0],
            items: [
              {
                id: "i1",
                product_id: "p1",
                product_name: "Kraft mailer box, E-flute",
                product_image_url: "https://cdn.example/kraft-mailer.jpg",
                product_slug: null,
                quantity: 1,
                unit_price: 5_000,
              },
            ],
          },
        ],
      },
      isLoading: false,
    };

    const { container } = render(wrap(<OrderDetailPage />));
    expect(container.querySelectorAll('a[href*="/product/"]')).toHaveLength(0);
    expect(container.textContent).toContain("Kraft mailer box, E-flute");
  });
});
