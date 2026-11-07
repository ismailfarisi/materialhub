import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type MutateOpts = { onSuccess?: () => void; onError?: (err: unknown) => void };
const mutate = vi.fn<(vars: { orderId: string; reason: string }, opts: MutateOpts) => void>();
vi.mock("@/lib/queries/orders", () => ({
	useCancelOrder: () => ({ mutate, isPending: false }),
}));
vi.mock("next-intl", () => ({
	useTranslations: () => (key: string) => key,
	useLocale: () => "en",
}));

import { OrderCancel, canBuyerCancel } from "./order-cancel";

describe("canBuyerCancel", () => {
	it("allows the statuses the backend lets a buyer cancel from", () => {
		expect(canBuyerCancel("pending_payment", [{ status: "confirmed" }])).toBe(true);
		expect(canBuyerCancel("confirmed", [{ status: "confirmed" }, { status: "confirmed" }])).toBe(true);
		expect(canBuyerCancel("confirmed", [])).toBe(true);
	});

	it("hides the action once the order or any supplier has moved on", () => {
		for (const s of ["processing", "shipped", "delivered", "cancelled", "payment_failed", "draft"]) {
			expect(canBuyerCancel(s, [])).toBe(false);
		}
		expect(canBuyerCancel("confirmed", [{ status: "confirmed" }, { status: "processing" }])).toBe(false);
		expect(canBuyerCancel(undefined, [])).toBe(false);
	});
});

describe("OrderCancel", () => {
	beforeEach(() => {
		mutate.mockReset();
	});

	it("renders nothing when the order can't be cancelled", () => {
		const { container } = render(<OrderCancel orderId="o1" orderStatus="shipped" vendorOrders={[]} />);
		expect(container.textContent).toBe("");
	});

	it("asks for confirmation and a reason before cancelling", () => {
		render(<OrderCancel orderId="o1" orderStatus="confirmed" vendorOrders={[{ status: "confirmed" }]} />);
		expect(screen.queryByRole("alertdialog")).toBeNull();
		fireEvent.click(screen.getByRole("button", { name: "action" }));
		expect(screen.getByRole("alertdialog")).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: "confirm" }));
		expect(screen.getByText("reasonRequired")).toBeTruthy();
		expect(mutate).not.toHaveBeenCalled();

		fireEvent.click(screen.getByRole("button", { name: "keep" }));
		expect(screen.queryByRole("alertdialog")).toBeNull();
		expect(mutate).not.toHaveBeenCalled();
	});

	it("cancels with the reason, confirms and refetches", () => {
		const onCancelled = vi.fn();
		mutate.mockImplementation((_vars, opts) => opts.onSuccess?.());
		render(
			<OrderCancel orderId="o1" orderStatus="pending_payment" vendorOrders={[]} onCancelled={onCancelled} />,
		);
		fireEvent.click(screen.getByRole("button", { name: "action" }));
		fireEvent.change(screen.getByLabelText("reason"), { target: { value: "  Ordered the wrong kraft weight  " } });
		fireEvent.click(screen.getByRole("button", { name: "confirm" }));
		expect(mutate).toHaveBeenCalledWith({ orderId: "o1", reason: "Ordered the wrong kraft weight" }, expect.anything());
		expect(onCancelled).toHaveBeenCalledTimes(1);
		expect(screen.queryByRole("alertdialog")).toBeNull();
		expect(screen.getByText("success")).toBeTruthy();
	});

	it("keeps the dialog open with the server's error when the cancel is refused", () => {
		mutate.mockImplementation((_vars, opts) =>
			opts.onError?.({ response: { data: { message: "Invalid transition: processing → cancelled by buyer" } } }),
		);
		render(<OrderCancel orderId="o1" orderStatus="confirmed" vendorOrders={[]} />);
		fireEvent.click(screen.getByRole("button", { name: "action" }));
		fireEvent.change(screen.getByLabelText("reason"), { target: { value: "No longer needed" } });
		fireEvent.click(screen.getByRole("button", { name: "confirm" }));
		expect(screen.getByRole("alertdialog")).toBeTruthy();
		expect(screen.getByText("Invalid transition: processing → cancelled by buyer")).toBeTruthy();
	});
});
