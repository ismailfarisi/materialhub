import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mutateAsync = vi.fn();
const ensureGuest = vi.fn(async () => "guest-token");

vi.mock("next-intl", () => ({
	useTranslations: () => (key: string, vals?: Record<string, string>) =>
		vals ? `${key}:${Object.values(vals).join(",")}` : key,
}));
vi.mock("@/lib/queries/support", () => ({
	useCreateTicket: () => ({ mutateAsync, isPending: false }),
}));
vi.mock("@/lib/api", () => ({ ensureGuestSessionToken: () => ensureGuest() }));
vi.mock("@/stores/auth", () => ({
	useAuthStore: (sel: (s: { user: null }) => unknown) => sel({ user: null }),
}));

// eslint-disable-next-line import/first
import { ContactForm } from "../contact-form";

function fill(label: string, value: string) {
	fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe("ContactForm", () => {
	beforeEach(() => {
		mutateAsync.mockReset();
		ensureGuest.mockClear();
	});

	it("labels every field and flags empty required fields without sending", async () => {
		render(<ContactForm />);
		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: "send" }));
		});
		expect(mutateAsync).not.toHaveBeenCalled();
		for (const label of ["name", "email", "subject", "message"]) {
			expect(screen.getByLabelText(label)).toHaveAttribute("aria-invalid", "true");
		}
		expect(screen.getAllByText("errorRequired")).toHaveLength(4);
	});

	it("rejects a malformed email", async () => {
		render(<ContactForm />);
		fill("name", "Mariam");
		fill("email", "not-an-email");
		fill("subject", "Greyboard");
		fill("message", "2 mm, 70x100");
		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: "send" }));
		});
		expect(screen.getByText("errorEmail")).toBeInTheDocument();
		expect(mutateAsync).not.toHaveBeenCalled();
	});

	it("sends a guest ticket and shows the ticket number", async () => {
		mutateAsync.mockResolvedValue({ ticket_number: "TCK-1042" });
		render(<ContactForm />);
		fill("name", "Mariam");
		fill("email", "mariam@workshop.ae");
		fireEvent.change(screen.getByLabelText("topic"), { target: { value: "trade" } });
		fill("subject", "Greyboard 2 mm, 500 sheets");
		fill("message", "Need 70x100 cm sheets.");
		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: "send" }));
		});
		expect(ensureGuest).toHaveBeenCalled();
		expect(mutateAsync).toHaveBeenCalledWith({
			subject: "Trade enquiry: Greyboard 2 mm, 500 sheets",
			category: null,
			message: "Need 70x100 cm sheets.",
			guest_name: "Mariam",
			guest_email: "mariam@workshop.ae",
		});
		expect(screen.getByRole("status")).toHaveTextContent("sentBody:TCK-1042,mariam@workshop.ae");
	});

	it("shows a recoverable error when sending fails", async () => {
		mutateAsync.mockRejectedValue(new Error("network"));
		render(<ContactForm />);
		fill("name", "Mariam");
		fill("email", "mariam@workshop.ae");
		fill("subject", "Order");
		fill("message", "Where is it?");
		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: "send" }));
		});
		expect(screen.getByRole("alert")).toHaveTextContent("errorSend");
		expect(screen.getByLabelText("message")).toHaveValue("Where is it?");
	});
});
