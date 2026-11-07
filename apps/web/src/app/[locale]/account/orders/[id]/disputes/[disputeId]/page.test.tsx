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
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "o1", disputeId: "d1" }) }));

import DisputeThreadPage from "./page";

const dispute = {
	id: "d1",
	dispute_number: "DSP-2026-000001",
	order_id: "o1",
	vendor_order_id: "vo1",
	status: "under_review",
	category: "not_as_described",
	description: "Greyboard arrived 1.0 mm, ordered 2.0 mm.",
	evidence_urls: [],
	resolution: null,
	resolution_amount: null,
	resolved_at: null,
	deadline_at: "2026-11-14T10:00:00.000Z",
	created_at: "2026-11-07T10:00:00.000Z",
};

function routeGet(overrides: Record<string, unknown> = {}) {
	get.mockImplementation(async (url: string) => {
		if (url === "/buyer/disputes/d1") return { data: { data: { ...dispute, ...overrides } } };
		if (url === "/disputes/d1/messages")
			return {
				data: {
					data: [
						{
							id: "m1",
							sender_role: "vendor",
							message: "We can send 2.0 mm sheets this week.",
							is_internal: false,
							created_at: "2026-11-07T11:00:00.000Z",
						},
					],
				},
			};
		throw new Error(`unexpected ${url}`);
	});
}

function renderPage() {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
	return render(
		<QueryClientProvider client={client}>
			<DisputeThreadPage />
		</QueryClientProvider>,
	);
}

beforeEach(() => {
	get.mockReset();
	post.mockReset();
});

describe("DisputeThreadPage", () => {
	it("shows the complaint and the supplier's reply, and posts a buyer reply", async () => {
		routeGet();
		post.mockResolvedValue({ data: { data: { id: "m2" } } });
		renderPage();
		expect(await screen.findByText("We can send 2.0 mm sheets this week.")).toBeInTheDocument();
		expect(screen.getByText("Greyboard arrived 1.0 mm, ordered 2.0 mm.")).toBeInTheDocument();

		fireEvent.change(screen.getByLabelText("reply"), { target: { value: "Yes please, 40 sheets." } });
		fireEvent.click(screen.getByRole("button", { name: "send" }));
		await waitFor(() =>
			expect(post).toHaveBeenCalledWith("/disputes/d1/messages", { message: "Yes please, 40 sheets." }),
		);
	});

	it("a closed dispute is read-only", async () => {
		routeGet({ status: "closed", resolution: "Replacement sent", resolved_at: "2026-11-09T10:00:00.000Z" });
		renderPage();
		expect(await screen.findByText("closedNote")).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "send" })).not.toBeInTheDocument();
		expect(screen.getByText("Replacement sent")).toBeInTheDocument();
	});

	it("a dispute from another order shows not found", async () => {
		routeGet({ order_id: "o-other" });
		renderPage();
		expect(await screen.findByText("notFound")).toBeInTheDocument();
	});
});
