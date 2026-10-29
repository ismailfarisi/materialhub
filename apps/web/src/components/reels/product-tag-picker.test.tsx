import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProductTagPicker } from "./product-tag-picker";

// Mock the reels API module
vi.mock("@/lib/api/reels", () => ({
  fetchTaggableProducts: vi.fn(),
  addReelTag: vi.fn(async (_reelId: string, input: any) => ({ id: "tag-1", ...input })),
  deleteReelTag: vi.fn(async () => undefined),
}));

// Import the mocked version
import { fetchTaggableProducts, addReelTag } from "@/lib/api/reels";

const mockedFetch = fetchTaggableProducts as ReturnType<typeof vi.fn>;

describe("ProductTagPicker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders initial tag chips and no dropdown", () => {
    render(
      <ProductTagPicker
        reelId="r1"
        videoDurationSeconds={30}
        initialTags={[
          { id: "t1", product: { id: "p1", name: "Existing" }, timestampSeconds: 5 },
        ]}
      />,
    );
    expect(screen.getByText(/Existing/)).toBeInTheDocument();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("fires fetchTaggableProducts on first focus", async () => {
    mockedFetch.mockResolvedValueOnce([]);
    render(
      <ProductTagPicker reelId="r1" videoDurationSeconds={30} initialTags={[]} />,
    );
    fireEvent.focus(screen.getByPlaceholderText(/Search your delivered/i));
    await waitFor(() => expect(mockedFetch).toHaveBeenCalledWith("", 10));
  });

  it("shows 'No delivered orders yet' empty state on focus with no results", async () => {
    mockedFetch.mockResolvedValueOnce([]);
    render(
      <ProductTagPicker reelId="r1" videoDurationSeconds={30} initialTags={[]} />,
    );
    fireEvent.focus(screen.getByPlaceholderText(/Search your delivered/i));
    await screen.findByText(/No delivered orders yet/);
  });

  it("renders rich rows: thumbnail, name, subtitle", async () => {
    mockedFetch.mockResolvedValueOnce([
      {
        product_id: "p1",
        name: "Gold-plated hoops",
        thumbnail_url: "https://img/p1.jpg",
        variant_label: "Medium / Gold",
        delivered_at: "2026-04-03T10:22:00Z",
        source: "purchased",
      },
    ]);
    render(
      <ProductTagPicker reelId="r1" videoDurationSeconds={30} initialTags={[]} />,
    );
    fireEvent.focus(screen.getByPlaceholderText(/Search your delivered/i));
    await screen.findByText("Gold-plated hoops");
    expect(screen.getByAltText("Gold-plated hoops")).toBeInTheDocument();
    expect(screen.getByText(/Medium \/ Gold/)).toBeInTheDocument();
    expect(screen.getByText(/Delivered/)).toBeInTheDocument();
  });

  it("shows 'Your catalog' for vendor_owned rows", async () => {
    mockedFetch.mockResolvedValueOnce([
      {
        product_id: "v1",
        name: "Catalog item",
        thumbnail_url: null,
        variant_label: null,
        delivered_at: null,
        source: "vendor_owned",
      },
    ]);
    render(
      <ProductTagPicker reelId="r1" videoDurationSeconds={30} initialTags={[]} />,
    );
    fireEvent.focus(screen.getByPlaceholderText(/Search your delivered/i));
    await screen.findByText("Catalog item");
    expect(screen.getByText("Your catalog")).toBeInTheDocument();
  });

  it("calls addReelTag on row click", async () => {
    mockedFetch.mockResolvedValueOnce([
      {
        product_id: "p1",
        name: "Hoops",
        thumbnail_url: null,
        variant_label: null,
        delivered_at: "2026-04-03T00:00:00Z",
        source: "purchased",
      },
    ]);
    render(
      <ProductTagPicker reelId="r1" videoDurationSeconds={30} initialTags={[]} />,
    );
    fireEvent.focus(screen.getByPlaceholderText(/Search your delivered/i));
    const row = await screen.findByText("Hoops");
    fireEvent.click(row);
    await waitFor(() =>
      expect(addReelTag).toHaveBeenCalledWith(
        "r1",
        expect.objectContaining({ productId: "p1" }),
      ),
    );
  });

  it("hides search field when 5 tags are present", () => {
    const initialTags = Array.from({ length: 5 }, (_, i) => ({
      id: `t${i}`,
      product: { id: `p${i}`, name: `Product ${i}` },
      timestampSeconds: i,
    }));
    render(
      <ProductTagPicker
        reelId="r1"
        videoDurationSeconds={30}
        initialTags={initialTags}
      />,
    );
    expect(screen.queryByPlaceholderText(/Search your delivered/i)).not.toBeInTheDocument();
  });

  it("shows retry on fetch error", async () => {
    mockedFetch.mockRejectedValueOnce(new Error("boom"));
    render(
      <ProductTagPicker reelId="r1" videoDurationSeconds={30} initialTags={[]} />,
    );
    fireEvent.focus(screen.getByPlaceholderText(/Search your delivered/i));
    const retry = await screen.findByText(/Retry/);
    mockedFetch.mockResolvedValueOnce([]);
    fireEvent.click(retry);
    await waitFor(() => expect(mockedFetch).toHaveBeenCalledTimes(2));
  });
});
