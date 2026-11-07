import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AxiosInstance } from "axios";
import { describe, expect, test, vi } from "vitest";
import { SectionConfigEditor, withQueryDefaults } from "./SectionConfigEditor";

function renderEditor(props: Partial<Parameters<typeof SectionConfigEditor>[0]> = {}) {
  const handlers = {
    onSettingsChange: vi.fn(),
    onBlocksChange: vi.fn(),
    onDataSourceChange: vi.fn(),
    onBidConfigChange: vi.fn(),
  };
  render(
    <SectionConfigEditor
      apiClient={{ get: vi.fn() } as unknown as AxiosInstance}
      sectionTypeName="product_carousel"
      sourceMode="query"
      settings={{}}
      blocks={[]}
      dataSource={{}}
      bidConfig={{}}
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

describe("withQueryDefaults", () => {
  test("fills type and missing query keys", () => {
    expect(withQueryDefaults({}, "products", { sort: "newest" })).toEqual({
      type: "products",
      query: { sort: "newest" },
    });
  });
  test("keeps what's stored and returns the same object when complete", () => {
    const ds = { type: "collection", query: { sort: "popular", collection_slug: "kraft" } };
    expect(withQueryDefaults(ds, "products", { sort: "newest" })).toBe(ds);
  });
});

describe("product_carousel query mode", () => {
  test("stores the displayed defaults (type products, sort newest)", async () => {
    const { onDataSourceChange } = renderEditor();
    await waitFor(() =>
      expect(onDataSourceChange).toHaveBeenCalledWith({ type: "products", query: { sort: "newest" } }),
    );
  });

  test("vendor_showcase stores type vendors", async () => {
    const { onDataSourceChange } = renderEditor({ sectionTypeName: "vendor_showcase" });
    await waitFor(() =>
      expect(onDataSourceChange).toHaveBeenCalledWith({ type: "vendors", query: {} }),
    );
  });
});

describe("product_carousel manual mode", () => {
  test("searches admin products and adds the pick as a product block", async () => {
    vi.useFakeTimers();
    const get = vi.fn(async () => ({
      data: { data: { items: [{ id: "p-1", name: "Greyboard 2 mm, 70×100 cm", slug: "greyboard-2mm", status: "published" }] } },
    }));
    const { onBlocksChange } = renderEditor({
      sourceMode: "manual",
      apiClient: { get } as unknown as AxiosInstance,
    });
    fireEvent.change(screen.getByLabelText("Add product"), { target: { value: "greyboard" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    vi.useRealTimers();
    expect(get).toHaveBeenCalledWith("/admin/products", { params: { search: "greyboard", limit: 20 } });
    fireEvent.click(await screen.findByRole("button", { name: /Greyboard 2 mm/ }));
    expect(onBlocksChange).toHaveBeenCalledWith([
      {
        id: "product-p-1",
        type: "product",
        data: { product_id: "p-1", name: "Greyboard 2 mm, 70×100 cm", slug: "greyboard-2mm" },
      },
    ]);
  });

  test("lists picks with reorder and remove", () => {
    const blocks = [
      { id: "a", type: "product", data: { product_id: "a", name: "Kraft paper roll" } },
      { id: "b", type: "product", data: { product_id: "b", name: "Book cloth" } },
    ];
    const { onBlocksChange } = renderEditor({ sourceMode: "manual", blocks });
    fireEvent.click(screen.getByRole("button", { name: "Move Book cloth up" }));
    expect(onBlocksChange).toHaveBeenLastCalledWith([blocks[1], blocks[0]]);
    fireEvent.click(screen.getByRole("button", { name: "Remove Kraft paper roll" }));
    expect(onBlocksChange).toHaveBeenLastCalledWith([blocks[1]]);
  });
});
