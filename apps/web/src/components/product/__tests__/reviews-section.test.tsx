import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const post = vi.fn();
vi.mock("@/lib/api", () => ({ api: { post: (...a: unknown[]) => post(...a), get: vi.fn() } }));

const auth = { isAuthenticated: false };
vi.mock("@/stores/auth", () => ({
	useAuthStore: (sel: (s: typeof auth) => unknown) => sel(auth),
}));

vi.mock("next-intl", () => ({
	useTranslations: () => (key: string) => key,
	useLocale: () => "en",
}));
vi.mock("next/link", () => ({
	default: ({ children, ...rest }: { children: ReactNode } & Record<string, unknown>) => <a {...rest}>{children}</a>,
}));

import { ReviewsSection } from "../reviews-section";

const reviews = [
	{
		id: "r1",
		rating: 4,
		title: "Sturdy E-flute mailers",
		body: "Folded cleanly, held 1.2 kg of greyboard offcuts.",
		is_verified_purchase: true,
		helpful_count: 2,
		created_at: "2026-11-07T11:44:54.000Z",
		user: { first_name: "Mariam", last_name: "H" },
	},
];

function renderSection() {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
	return render(
		<QueryClientProvider client={client}>
			<ReviewsSection productId="p1" ratingAvg={4} reviewCount={1} initialReviews={reviews} />
		</QueryClientProvider>,
	);
}

beforeEach(() => {
	post.mockReset();
	auth.isAuthenticated = false;
});

describe("ReviewsSection review actions", () => {
	it("shows no vote or report buttons to signed-out visitors", () => {
		renderSection();
		expect(screen.queryByRole("button", { name: "reviewWasHelpful" })).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "reviewReport" })).not.toBeInTheDocument();
	});

	it("lets a signed-in buyer vote helpful", async () => {
		auth.isAuthenticated = true;
		post.mockResolvedValue({ data: { data: { id: "r1", helpful_count: 3, not_helpful_count: 0 } } });
		renderSection();
		fireEvent.click(screen.getByRole("button", { name: "reviewWasHelpful" }));
		await waitFor(() => expect(post).toHaveBeenCalledWith("/reviews/r1/vote", { is_helpful: true }));
		expect(await screen.findByText("reviewThanks")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "reviewWasHelpful" })).toHaveAttribute("aria-pressed", "true");
	});

	it("reports a review once and confirms", async () => {
		auth.isAuthenticated = true;
		post.mockResolvedValue({ data: { data: { id: "r1", status: "approved", flag_count: 1, hidden: false } } });
		renderSection();
		fireEvent.click(screen.getByRole("button", { name: "reviewReport" }));
		await waitFor(() => expect(post).toHaveBeenCalledWith("/reviews/r1/flag", {}));
		expect(await screen.findByText("reviewReported")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "reviewReport" })).toBeDisabled();
	});

	it("explains a 403 on your own review instead of failing silently", async () => {
		auth.isAuthenticated = true;
		post.mockRejectedValue({ response: { status: 403, data: { statusCode: 403 } } });
		renderSection();
		fireEvent.click(screen.getByRole("button", { name: "reviewWasHelpful" }));
		expect(await screen.findByText("reviewOwn")).toBeInTheDocument();
	});
});
