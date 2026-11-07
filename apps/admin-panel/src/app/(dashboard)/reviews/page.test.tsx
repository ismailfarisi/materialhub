import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const rejectMutate = vi.fn();
const approveMutate = vi.fn();
const listCalls: unknown[] = [];
const toastSpy = vi.fn();

const rows = [
  {
    id: "r1",
    product_id: "p1",
    product_name: "Kraft mailer box, E-flute, pack of 50",
    product_slug: "kraft-mailer",
    vendor_id: "v1",
    vendor_name: "Gulf Board Supply",
    user_id: "u1",
    reviewer_name: "Mariam Haddad",
    reviewer_email: "mariam@buyer.test",
    rating: 4,
    title: "Sturdy E-flute mailers",
    body: "Folded cleanly and held 1.2 kg of greyboard offcuts.",
    status: "pending",
    flag_count: 0,
    rejection_reason: null,
    is_verified_purchase: true,
    helpful_count: 0,
    created_at: "2026-11-07T11:44:54.000Z",
  },
  {
    id: "r2",
    product_id: "p2",
    product_name: "Paperboard sip lid, 80 mm",
    product_slug: "lid",
    vendor_id: "v1",
    vendor_name: "Gulf Board Supply",
    user_id: "u2",
    reviewer_name: "Omar Saeed",
    reviewer_email: null,
    rating: 2,
    title: null,
    body: "Lids pop off 80 mm cups.",
    status: "approved",
    flag_count: 2,
    rejection_reason: null,
    is_verified_purchase: true,
    helpful_count: 1,
    created_at: "2026-11-06T09:00:00.000Z",
  },
];

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/queries/reviews", () => ({
  useAdminReviews: (filters: unknown) => {
    listCalls.push(filters);
    return { data: { items: rows, total: 2 }, isLoading: false, isError: false };
  },
  useApproveReview: () => ({ mutate: approveMutate, isPending: false, variables: undefined }),
  useRejectReview: () => ({ mutate: rejectMutate, isPending: false }),
}));

vi.mock("@materialhub/ui", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, toast: (...args: unknown[]) => toastSpy(...args) };
});

import ReviewsPage from "./page";

beforeEach(() => {
  rejectMutate.mockReset();
  approveMutate.mockReset();
  toastSpy.mockReset();
  listCalls.length = 0;
});

describe("ReviewsPage", () => {
  test("opens on the moderation queue and shows product, reviewer, reports and the total", () => {
    render(<ReviewsPage />);
    expect(listCalls[0]).toMatchObject({ status: "needs_moderation" });
    expect(screen.getByText("Kraft mailer box, E-flute, pack of 50")).toBeInTheDocument();
    expect(screen.getByText("Mariam Haddad")).toBeInTheDocument();
    expect(screen.getByText("2 reports")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Keep published" })).toBeInTheDocument();
    expect(screen.getByText(/2 total/i)).toBeInTheDocument();
  });

  test("Reject asks for a reason and sends it as rejection_reason", async () => {
    render(<ReviewsPage />);
    fireEvent.click(screen.getAllByRole("button", { name: "Reject" })[0]!);
    fireEvent.click(await screen.findByRole("button", { name: "Reject review" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Give a reason");
    expect(rejectMutate).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "Describes a different box size." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reject review" }));
    expect(rejectMutate).toHaveBeenCalledWith(
      { id: "r1", rejection_reason: "Describes a different box size." },
      expect.any(Object),
    );
  });

  test("a failed reject is shown, not swallowed", async () => {
    rejectMutate.mockImplementation((_vars, opts) =>
      opts.onError({ response: { data: { message: "Only pending, flagged or reported reviews can be rejected" } } }),
    );
    render(<ReviewsPage />);
    fireEvent.click(screen.getAllByRole("button", { name: "Reject" })[0]!);
    fireEvent.change(await screen.findByLabelText("Reason"), { target: { value: "Spam" } });
    fireEvent.click(screen.getByRole("button", { name: "Reject review" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Only pending, flagged or reported"),
    );
  });

  test("a failed approve raises a toast", () => {
    approveMutate.mockImplementation((_id, opts) => opts.onError({ response: { data: { message: "nope" } } }));
    render(<ReviewsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Could not approve", variant: "destructive" }),
    );
  });
});
