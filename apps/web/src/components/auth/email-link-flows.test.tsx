import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const post = vi.fn();
let token: string | null = "tok_123";
vi.mock("@/lib/api", () => ({ api: { post: (...a: unknown[]) => post(...a) } }));
vi.mock("next/navigation", () => ({
	useSearchParams: () => ({ get: () => token }),
	useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));
vi.mock("next-intl", () => ({
	useLocale: () => "en",
	useTranslations: () => (key: string) => key,
}));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock("./auth-shell", () => ({
	AuthShell: ({ title, children }: { title: string; children: React.ReactNode }) => (
		<div>
			<h1>{title}</h1>
			{children}
		</div>
	),
}));

import { MagicLinkVerifyFlow, VerifyEmailFlow } from "./email-link-flows";

describe("email link pages", () => {
	beforeEach(() => {
		post.mockReset();
		token = "tok_123";
	});

	it("verify-email posts the token from the link once", async () => {
		post.mockResolvedValue({ data: {} });
		render(<VerifyEmailFlow />);
		await waitFor(() => expect(screen.getByText("verifyDone")).toBeTruthy());
		expect(post).toHaveBeenCalledTimes(1);
		expect(post).toHaveBeenCalledWith("/auth/verify-email", { token: "tok_123" });
	});

	it("explains a link without a token instead of calling the API", () => {
		token = null;
		render(<VerifyEmailFlow />);
		expect(screen.getByText("linkMissing")).toBeTruthy();
		expect(post).not.toHaveBeenCalled();
	});

	it("magic link shows a way back when the token is rejected", async () => {
		post.mockRejectedValue(new Error("expired"));
		render(<MagicLinkVerifyFlow />);
		await waitFor(() => expect(screen.getByText("backToLogin")).toBeTruthy());
		expect(post).toHaveBeenCalledWith("/auth/magic-link/verify", { token: "tok_123" });
	});
});
