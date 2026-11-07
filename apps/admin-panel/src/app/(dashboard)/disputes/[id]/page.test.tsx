import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const resolveMutate = vi.fn();
const escalateMutate = vi.fn();
const assignMutate = vi.fn();
const sendMutate = vi.fn();

const dispute = {
  id: "d1",
  dispute_number: "DSP-2026-000001",
  status: "under_review",
  category: "not_as_described",
  description: "Greyboard arrived 1.0 mm, ordered 2.0 mm.",
  evidence_urls: [],
  order_id: "o1",
  order_number: "MH-1001",
  order_status: "disputed",
  order_total: 26250,
  order_refund_total: 0,
  currency: "AED",
  vendor_order_id: "vo1",
  vendor_order_number: "MH-1001-A",
  vendor_order_total: 25000,
  vendor_id: "v1",
  vendor_name: "Gulf Board Supply",
  opened_by: "u1",
  buyer_name: "Mariam Haddad",
  buyer_email: "mariam@buyer.test",
  assigned_to: "a1",
  assigned_to_name: "Omar Saeed",
  resolution: null,
  resolution_amount: null,
  resolved_at: null,
  escalated_at: null,
  deadline_at: "2026-11-14T10:00:00.000Z",
  created_at: "2026-11-07T10:00:00.000Z",
  updated_at: "2026-11-07T10:00:00.000Z",
  messages: [
    {
      id: "m1",
      sender_id: "vu1",
      sender_role: "vendor",
      message: "We can send 2.0 mm sheets this week.",
      attachment_urls: [],
      is_internal: false,
      created_at: "2026-11-07T11:00:00.000Z",
    },
    {
      id: "m2",
      sender_id: "a1",
      sender_role: "admin",
      message: "Check the caliper photo first.",
      attachment_urls: [],
      is_internal: true,
      created_at: "2026-11-07T11:30:00.000Z",
    },
  ],
};

vi.mock("next/navigation", () => ({ useParams: () => ({ id: "d1" }) }));
vi.mock("@/lib/queries/disputes", () => ({
  useDispute: () => ({ data: dispute, isLoading: false, isError: false }),
  useAdminAssignees: () => ({
    data: [{ id: "a1", name: "Omar Saeed", email: "omar@materialhub.test", role: "admin" }],
    isLoading: false,
  }),
  useAssignDispute: () => ({ mutate: assignMutate, isPending: false }),
  useEscalateDispute: () => ({ mutate: escalateMutate, isPending: false }),
  useCloseDispute: () => ({ mutate: vi.fn(), isPending: false }),
  useResolveDispute: () => ({ mutate: resolveMutate, isPending: false }),
  useAddDisputeMessage: () => ({ mutate: sendMutate, isPending: false }),
}));

import DisputeDetailPage from "./page";

beforeEach(() => {
  for (const m of [resolveMutate, escalateMutate, assignMutate, sendMutate]) m.mockReset();
  Element.prototype.scrollIntoView = vi.fn();
});

describe("DisputeDetailPage", () => {
  test("shows the complaint, the supplier reply and the internal note", () => {
    render(<DisputeDetailPage />);
    expect(screen.getByText("Greyboard arrived 1.0 mm, ordered 2.0 mm.")).toBeInTheDocument();
    expect(screen.getByText("We can send 2.0 mm sheets this week.")).toBeInTheDocument();
    expect(screen.getByText("Internal note")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Escalate" })).toBeInTheDocument();
  });

  test("Resolve sends decision + resolution + amount in fils", async () => {
    render(<DisputeDetailPage />);
    fireEvent.click(screen.getByRole("button", { name: "Resolve…" }));
    fireEvent.change(await screen.findByLabelText("Refund (AED)"), { target: { value: "120" } });
    fireEvent.change(screen.getByLabelText("Decision note"), {
      target: { value: "Caliper photo shows 1.0 mm board." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm resolution" }));
    expect(resolveMutate).toHaveBeenCalledWith(
      {
        id: "d1",
        payload: {
          decision: "buyer",
          resolution: "Caliper photo shows 1.0 mm board.",
          resolution_amount: 12000,
          refund_method: "wallet",
        },
      },
      expect.any(Object),
    );
  });

  test("a refund above the supplier's share is refused before sending", async () => {
    render(<DisputeDetailPage />);
    fireEvent.click(screen.getByRole("button", { name: "Resolve…" }));
    fireEvent.change(await screen.findByLabelText("Refund (AED)"), { target: { value: "999" } });
    fireEvent.change(screen.getByLabelText("Decision note"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm resolution" }));
    expect(screen.getByRole("alert")).toHaveTextContent("more than the buyer paid");
    expect(resolveMutate).not.toHaveBeenCalled();
  });

  test("posting an internal note sets is_internal", () => {
    render(<DisputeDetailPage />);
    fireEvent.click(screen.getByLabelText(/Internal note \(admins only\)/));
    fireEvent.change(screen.getByLabelText("Internal note"), { target: { value: "Waiting on photos" } });
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
    expect(sendMutate).toHaveBeenCalledWith(
      { id: "d1", message: "Waiting on photos", is_internal: true },
      expect.any(Object),
    );
  });
});
