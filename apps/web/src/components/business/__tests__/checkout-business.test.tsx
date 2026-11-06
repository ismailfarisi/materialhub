import { PaymentSection } from "@/components/checkout/payment-section";
import type { CheckoutQuoteBusiness } from "@/lib/business/types";
import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	ApprovalRequiredPanel,
	BusinessCheckoutBlock,
	NetTermsOptionText,
	useApprovalGate,
} from "../checkout-business";

// Translations render as "<namespace>.<key>" plus their values, so tests can
// assert which message and which numbers were used.
vi.mock("next-intl", () => ({
	useLocale: () => "en",
	useTranslations:
		(ns = "") =>
		(key: string, values?: Record<string, unknown>) =>
			`${ns}.${key}${values ? ` ${JSON.stringify(values)}` : ""}`,
}));

vi.mock("next/link", () => ({
	default: ({
		href,
		children,
		...rest
	}: { href: string; children: React.ReactNode }) => (
		<a href={href} {...rest}>
			{children}
		</a>
	),
}));

vi.mock("@stripe/react-stripe-js", () => ({
	CardElement: () => <div data-testid="stripe-card-element" />,
	ExpressCheckoutElement: () => <div data-testid="stripe-express-checkout" />,
}));

const mocks = vi.hoisted(() => ({
	requestApproval: vi.fn(),
	invalidateQueries: vi.fn(),
	store: {} as Record<string, unknown>,
}));

vi.mock("@tanstack/react-query", () => ({
	useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));

vi.mock("@/lib/queries/business", () => ({
	useBusiness: () => ({ data: { credit: { terms: "net_60" } } }),
	useRequestApproval: () => ({
		mutateAsync: mocks.requestApproval,
		isPending: false,
	}),
}));

vi.mock("@/lib/queries/checkout-quote", () => ({
	usePaymentInstruments: () => ({ data: { instruments: [] } }),
	invalidateQuoteEtag: vi.fn(),
}));

vi.mock("@/stores/checkout", () => ({
	useCheckoutStore: (selector?: (s: Record<string, unknown>) => unknown) =>
		selector ? selector(mocks.store) : mocks.store,
}));

/** The sentence form of an amount: bidi-isolated (toHaveTextContent folds the no-break space). */
const money = (n: string) => `\u2066AED ${n}\u2069`;

const business: CheckoutQuoteBusiness = {
	legal_name: "Gulf Rigid Box Workshop LLC",
	trn: "100234567800003",
	billing_address: {
		line1: "Warehouse 14, Street 7",
		city: "Dubai",
		emirate: "Dubai",
		country_code: "AE",
	},
	role: "buyer",
	approval_threshold_fils: 500_000,
	approval_required: true,
	approval: null,
	terms: "net_30",
};

const netTerms = (over: Record<string, unknown> = {}) => ({
	id: "net_terms" as const,
	available: true,
	surcharge_fils: 0,
	surcharge_type: "fixed" as const,
	max_amount_fils: 4_250_000,
	reason_key: null,
	...over,
});

function setQuote(
	methods: unknown[],
	b: CheckoutQuoteBusiness | null = business,
	paymentMethod = "card",
) {
	mocks.store = {
		quoteData: {
			totals: { grand_total_fils: 1_284_000 },
			payment_methods: methods,
			business: b,
		},
		paymentMethod,
		setPaymentMethod: vi.fn(),
		selectedAddressId: "addr-1",
	};
}

describe("net terms payment option", () => {
	beforeEach(() => {
		useApprovalGate.setState({ blocked: false });
		mocks.requestApproval.mockReset();
	});

	it("labels the option with the terms and shows available credit", () => {
		setQuote([netTerms()]);
		render(<NetTermsOptionText method={netTerms()} />);
		expect(
			screen.getByText(/business\.checkout\.methodName/),
		).toHaveTextContent('"terms":"business.checkout.termsShort.net_30"');
		const hint = screen.getByText(/business\.checkout\.hint/);
		expect(hint).toHaveTextContent('"days":30');
		expect(hint).toHaveTextContent(`"available":"${money("42,500")}"`);
	});

	it("falls back to the credit account's terms when the quote has none", () => {
		setQuote([netTerms()], { ...business, terms: undefined });
		render(<NetTermsOptionText method={netTerms()} />);
		expect(screen.getByText(/methodName/)).toHaveTextContent(
			"termsShort.net_60",
		);
	});

	it("explains why it is disabled, from reason_key", () => {
		const m = netTerms({
			available: false,
			reason_key: "payment.net_terms.over_credit",
			reason_params: { available: { type: "money", value: 300_000 } },
		});
		setQuote([m]);
		render(<NetTermsOptionText method={m} />);
		expect(
			screen.getByText(/business\.checkout\.reason\.overCredit/),
		).toHaveTextContent(`"available":"${money("3,000")}"`);
	});

	it.each([
		["payment.net_terms.overdue", "reason.overdue"],
		["payment.net_terms.not_verified", "reason.notVerified"],
	])("maps %s", (reasonKey, message) => {
		const m = netTerms({ available: false, reason_key: reasonKey });
		setQuote([m]);
		render(<NetTermsOptionText method={m} />);
		expect(
			screen.getByText(
				new RegExp(`business\\.checkout\\.${message.replace(".", "\\.")}`),
			),
		).toBeInTheDocument();
	});

	it("renders in the payment section as a disabled radio when unavailable", () => {
		const m = netTerms({
			available: false,
			reason_key: "payment.net_terms.overdue",
		});
		setQuote([
			{
				id: "card",
				available: true,
				surcharge_fils: 0,
				surcharge_type: "fixed",
				reason_key: null,
			},
			m,
		]);
		render(<PaymentSection />);
		const radios = screen.getAllByRole("radio");
		expect(radios).toHaveLength(2);
		expect(radios[1]).toBeDisabled();
		expect(screen.getByText(/reason\.overdue/)).toBeInTheDocument();
		// The checkout namespace never receives the business reason key.
		expect(screen.queryByText(/^payment\.net_terms/)).not.toBeInTheDocument();
	});

	it("selects pay on invoice and shows the due-date details", () => {
		setQuote([netTerms()], business, "net_terms");
		render(<PaymentSection />);
		expect(screen.getByRole("radio", { name: /methodName/ })).toBeChecked();
		expect(screen.getByText(/business\.checkout\.details/)).toBeInTheDocument();
	});
});

describe("approval-required panel", () => {
	beforeEach(() => {
		useApprovalGate.setState({ blocked: false });
		mocks.requestApproval.mockReset();
		mocks.invalidateQueries.mockReset();
		setQuote([netTerms()]);
		Element.prototype.scrollIntoView = vi.fn();
	});

	it("states the company's limit and sends the cart for approval with a note", async () => {
		mocks.requestApproval.mockResolvedValue({ id: "apr-1", status: "pending" });
		render(<ApprovalRequiredPanel business={business} />);
		expect(screen.getByText(/approval\.body/)).toHaveTextContent(
			`"amount":"${money("5,000")}"`,
		);

		fireEvent.change(screen.getByLabelText(/approval\.noteLabel/), {
			target: { value: "Rush job for the Expo boxes" },
		});
		fireEvent.click(screen.getByRole("button", { name: /approval\.send/ }));

		await waitFor(() =>
			expect(mocks.requestApproval).toHaveBeenCalledWith({
				note: "Rush job for the Expo boxes",
			}),
		);
		await waitFor(() =>
			expect(screen.getByRole("status")).toHaveTextContent("approval.pending"),
		);
		expect(mocks.invalidateQueries).toHaveBeenCalledWith({
			queryKey: ["checkout", "quote"],
		});
		expect(
			screen.queryByRole("button", { name: /approval\.send/ }),
		).not.toBeInTheDocument();
	});

	it("shows a pending request from the quote without a send button", () => {
		render(
			<ApprovalRequiredPanel
				business={{ ...business, approval: { id: "apr-1", status: "pending" } }}
			/>,
		);
		expect(screen.getByRole("status")).toHaveTextContent("approval.pending");
		expect(screen.queryByRole("button")).not.toBeInTheDocument();
	});

	it("appears before paying when the quote says approval is required, plus the invoice-to block", () => {
		render(<BusinessCheckoutBlock />);
		expect(screen.getByText(/approval\.title/)).toBeInTheDocument();
		expect(screen.getByText("Gulf Rigid Box Workshop LLC")).toBeInTheDocument();
		expect(screen.getByText("100234567800003")).toBeInTheDocument();
		expect(
			screen.getByRole("link", { name: /editInBusiness/ }),
		).toHaveAttribute("href", "/en/account/business");
	});

	it("appears after a 403 APPROVAL_REQUIRED even if the quote didn't flag it", () => {
		setQuote([netTerms()], { ...business, approval_required: false });
		const { rerender } = render(<BusinessCheckoutBlock />);
		expect(screen.queryByText(/approval\.title/)).not.toBeInTheDocument();
		act(() => useApprovalGate.setState({ blocked: true }));
		rerender(<BusinessCheckoutBlock />);
		expect(screen.getByText(/approval\.title/)).toBeInTheDocument();
	});

	it("renders nothing for a buyer without a business", () => {
		setQuote([], null);
		const { container } = render(<BusinessCheckoutBlock />);
		expect(container).toBeEmptyDOMElement();
	});
});
