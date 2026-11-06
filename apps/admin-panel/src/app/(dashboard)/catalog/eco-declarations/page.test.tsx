import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import EcoDeclarationsPage from "./page";
import { reviewWarnings } from "./review-warnings";

const approveMutate = vi.fn();
const rejectMutate = vi.fn();
const listCalls: unknown[] = [];

const row = {
  id: "d1",
  product_id: "p1",
  vendor_id: "v1",
  status: "pending",
  statement: "Paperboard cup, water-based barrier, no PE lining.",
  certificate_filename: "pefc-coc.pdf",
  has_certificate: true,
  submitted_at: "2026-11-02T09:00:00.000Z",
  reviewed_at: null,
  reviewed_by: null,
  rejection_reason: null,
  product: {
    id: "p1",
    name: "Single-wall paper cup, 8 oz",
    slug: "cup",
    status: "published",
    sku: "MH-ECO-CUP-08",
    category_name: "Paper Cups & Lids",
  },
  vendor: { id: "v1", name: "MaterialHub Eco Supply", slug: "materialhub-eco-supply" },
  eco_attributes: [
    { slug: "material-composition", name: "Material composition", values: ["Paperboard"] },
    { slug: "plastic-free", name: "Plastic-free", values: ["Yes"] },
  ],
};

vi.mock("@/lib/queries/eco-declarations", () => ({
  useEcoDeclarations: (filters: unknown) => {
    listCalls.push(filters);
    return {
      data: { items: [row], total: 1, page: 1, limit: 20, hasMore: false },
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    };
  },
  useApproveEcoDeclaration: () => ({ mutateAsync: approveMutate, isPending: false }),
  useRejectEcoDeclaration: () => ({ mutateAsync: rejectMutate, isPending: false }),
  fetchCertificateUrl: vi.fn(async () => "https://signed.example/cert.pdf"),
}));

beforeEach(() => {
  approveMutate.mockReset().mockResolvedValue({});
  rejectMutate.mockReset().mockResolvedValue({});
  listCalls.length = 0;
});

describe("EcoDeclarationsPage", () => {
  test("lists pending declarations by default and expands the detail", () => {
    render(<EcoDeclarationsPage />);
    expect(listCalls[0]).toMatchObject({ status: "pending", page: 1 });
    expect(screen.getByText("Single-wall paper cup, 8 oz")).toBeInTheDocument();
    expect(screen.queryByText(/water-based barrier/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Single-wall paper cup/ }));
    expect(screen.getByText(/water-based barrier/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /pefc-coc\.pdf/ })).toBeInTheDocument();
    expect(screen.getByText("Material composition")).toBeInTheDocument();
  });

  test("approve asks for confirmation and states it is not a legal certification", async () => {
    render(<EcoDeclarationsPage />);
    fireEvent.click(screen.getByRole("button", { name: /Single-wall paper cup/ }));
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(screen.getByText(/This confirms you reviewed the declaration/)).toHaveTextContent(
      /not a legal certification/,
    );
    expect(approveMutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm approval" }));
    await waitFor(() => expect(approveMutate).toHaveBeenCalledWith("d1"));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Approved: Single-wall paper cup, 8 oz",
    );
  });

  test("reject requires a reason of at least 5 characters", async () => {
    render(<EcoDeclarationsPage />);
    fireEvent.click(screen.getByRole("button", { name: /Single-wall paper cup/ }));
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    const confirm = screen.getByRole("button", { name: "Confirm rejection" });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: "no" } });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Reason/), {
      target: { value: "  The lid has a PE film.  " },
    });
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(rejectMutate).toHaveBeenCalledWith({ id: "d1", reason: "The lid has a PE film." }),
    );
  });

  test("shows the API error inline when approval fails", async () => {
    approveMutate.mockRejectedValue({
      response: { data: { message: "The vendor withdrew this declaration" } },
    });
    render(<EcoDeclarationsPage />);
    fireEvent.click(screen.getByRole("button", { name: /Single-wall paper cup/ }));
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm approval" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The vendor withdrew this declaration",
    );
  });

  test("switching tabs queries that status", () => {
    render(<EcoDeclarationsPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Rejected" }));
    expect(listCalls.at(-1)).toMatchObject({ status: "rejected" });
  });
});

describe("reviewWarnings", () => {
  test("flags contradictions in the listing's own attributes", () => {
    const w = reviewWarnings({
      eco_attributes: [
        { slug: "plastic-free", name: "Plastic-free", values: ["No"] },
        {
          slug: "material-composition",
          name: "Material",
          values: ["Paperboard", "PE lining (plastic)"],
        },
        { slug: "bag-thickness-microns", name: "Bag thickness", values: ["40"] },
      ],
    });
    expect(w).toHaveLength(3);
    expect(w[2]).toMatch(/under 50 microns/);
  });
  test("flags an empty attribute set and passes a clean one", () => {
    expect(reviewWarnings({ eco_attributes: [] })).toEqual([
      "No compliance attributes are filled in on this listing.",
    ]);
    expect(
      reviewWarnings({
        eco_attributes: [{ slug: "plastic-free", name: "Plastic-free", values: ["Yes"] }],
      }),
    ).toEqual([]);
  });
});
