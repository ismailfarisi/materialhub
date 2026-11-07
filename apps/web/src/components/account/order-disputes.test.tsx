import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.fn();
const post = vi.fn();
vi.mock("@/lib/api", () => ({
	api: { get: (...a: unknown[]) => get(...a), post: (...a: unknown[]) => post(...a) },
}));
vi.mock("next-intl", () => ({
	useTranslations: () => (key: string) => key,
	useLocale: () => "en",
}));
vi.mock("next/link", () => ({
	default: ({ children, ...rest }: { children: ReactNode } & Record<string, unknown>) => <a {...rest}>{children}</a>,
}));

import { OrderDisputes } from "./order-disputes";

function renderPanel(props: Partial<Parameters<typeof OrderDisputes>[0]> = {}) {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
	return render(
		<QueryClientProvider client={client}>
			<OrderDisputes
				orderId="o1"
				orderStatus="delivered"
				vendorOrders={[
					{ id: "vo1", vendor_order_number: "MH-1001-A", status: "delivered" },
					{ id: "vo2", vendor_order_number: "MH-1001-B", status: "delivered" },
				]}
				{...props}
			/>
		</QueryClientProvider>,
	);
}

beforeEach(() => {
	get.mockReset();
	post.mockReset();
});

describe("OrderDisputes", () => {
	it("renders nothing and fetches nothing before the order ships", () => {
		const { container } = renderPanel({ orderStatus: "processing" });
		expect(container).toBeEmptyDOMElement();
		expect(get).not.toHaveBeenCalled();
	});

	it("lists this order's disputes with a link to the thread", async () => {
		get.mockResolvedValue({
			data: {
				data: [
					{
						id: "d1",
						dispute_number: "DSP-2026-000001",
						order_id: "o1",
						status: "under_review",
						category: "not_as_described",
						description: "1.0 mm board, ordered 2.0 mm",
						created_at: "2026-11-07T10:00:00.000Z",
					},
				],
			},
		});
		renderPanel({ orderStatus: "disputed" });
		expect(await screen.findByText("DSP-2026-000001")).toBeInTheDocument();
		expect(get).toHaveBeenCalledWith("/buyer/disputes", { params: { order_id: "o1", limit: 20 } });
		expect(screen.getByRole("link", { name: "view" })).toHaveAttribute("href", "/en/account/orders/o1/disputes/d1");
		// A case is open (and the order is disputed): no second one.
		expect(screen.queryByRole("button", { name: "open" })).not.toBeInTheDocument();
	});

	it("opens a dispute against the chosen supplier", async () => {
		get.mockResolvedValue({ data: { data: [] } });
		post.mockResolvedValue({ data: { data: { id: "d2" } } });
		renderPanel();
		fireEvent.click(await screen.findByRole("button", { name: "open" }));
		fireEvent.click(screen.getByRole("button", { name: "submit" }));
		expect(await screen.findByText("descriptionRequired")).toBeInTheDocument();
		expect(post).not.toHaveBeenCalled();

		fireEvent.change(screen.getByLabelText("supplier"), { target: { value: "vo2" } });
		fireEvent.change(screen.getByLabelText("description"), {
			target: { value: "Kraft rolls arrived water-damaged at the core." },
		});
		fireEvent.click(screen.getByRole("button", { name: "submit" }));
		await waitFor(() =>
			expect(post).toHaveBeenCalledWith("/orders/o1/dispute", {
				category: "not_as_described",
				description: "Kraft rolls arrived water-damaged at the core.",
				vendor_order_id: "vo2",
			}),
		);
		expect(await screen.findByText("opened")).toBeInTheDocument();
	});

	it("only offers 'not received' while the order is in transit", async () => {
		get.mockResolvedValue({ data: { data: [] } });
		renderPanel({ orderStatus: "shipped", vendorOrders: [{ id: "vo1" }] });
		fireEvent.click(await screen.findByRole("button", { name: "open" }));
		const options = screen.getAllByRole("option").map((o) => (o as HTMLOptionElement).value);
		expect(options).toEqual(["item_not_received"]);
	});
});
