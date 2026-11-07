"use client";

import { useVendorWarehouses } from "@/lib/queries/dashboard";
import { useAdjustInventory, useRestockInventory } from "@/lib/queries/products";
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from "@materialhub/ui";
import { useState } from "react";

export interface VendorWarehouse {
  id: string;
  name: string;
  is_active: boolean;
  is_default: boolean;
}

export interface InventoryRecord {
  id: string;
  variant_id?: string | null;
  warehouse_id?: string | null;
  quantity_on_hand: number;
  quantity_reserved: number;
}

/**
 * A row can point at a warehouse the vendor doesn't own — legacy seed data put
 * stock in an ownerless warehouse. Naming it "Unassigned" beats showing an id
 * fragment, which is what the admin panel used to do.
 */
export function warehouseLabel(
  warehouseId: string | null | undefined,
  warehouses: VendorWarehouse[] | undefined,
): string {
  if (!warehouseId) return "Unassigned";
  return warehouses?.find((w) => w.id === warehouseId)?.name ?? "Unassigned";
}

/**
 * Which of the two inventory actions is submittable for the current input.
 *
 * The two buttons have different valid ranges, so they can't share one guard:
 * - Restock *adds* stock and the `/inventory/restock` API rejects `quantity < 1`,
 *   so it needs a strictly positive number. (A negative in the box must not enable
 *   it — `run()` `Math.abs()`es the amount, which would silently add stock.)
 * - Adjust applies a *signed* delta: a negative reduces stock, so negatives are
 *   allowed (positives add). Both actions treat 0 the same way — disabled, since a
 *   0 restock is rejected by the API and a 0 adjust is a no-op. To actually reach an
 *   out-of-stock state, use "Mark out of stock". An empty box (which `Number("")`
 *   turns into 0) is never submittable either.
 */
export function inventoryButtonState(input: {
  targetWarehouse: string;
  quantity: string;
  busy: boolean;
}): { canRestock: boolean; canAdjust: boolean } {
  const trimmed = input.quantity.trim();
  const amount = Number(trimmed);
  const ready =
    Boolean(input.targetWarehouse) && trimmed !== "" && Number.isFinite(amount) && !input.busy;
  return {
    canRestock: ready && amount > 0,
    canAdjust: ready && amount !== 0,
  };
}

/**
 * On-hand currently recorded for a warehouse across the product-level rows.
 * Rows are already variant-filtered by the caller; a warehouse can in theory
 * appear more than once (legacy dup rows), so sum rather than pick the first.
 */
export function onHandForWarehouse(
  rows: InventoryRecord[],
  warehouseId: string | null | undefined,
): number {
  if (!warehouseId) return 0;
  return rows
    .filter((r) => r.warehouse_id === warehouseId)
    .reduce((sum, r) => sum + (r.quantity_on_hand ?? 0), 0);
}

export interface InventoryVariant {
  id: string;
  name: string;
  sku?: string | null;
}

/**
 * Stock rows for one sellable: the product itself (`variantId` null) or one
 * variant. A product with variants keeps its stock on the variant rows.
 */
export function rowsForSellable(
  records: InventoryRecord[],
  variantId: string | null,
): InventoryRecord[] {
  return records.filter((r) => (variantId ? r.variant_id === variantId : !r.variant_id));
}

/** Display name for a variant option: "A1 / pack of 100 (KRF-120-A1)". */
export function variantLabel(v: InventoryVariant): string {
  const name = v.name?.trim() || "Unnamed variant";
  return v.sku ? `${name} (${v.sku})` : name;
}

export function InventoryPanel({
  productId,
  inventoryRecords,
  variants = [],
}: {
  productId: string;
  inventoryRecords: InventoryRecord[];
  variants?: InventoryVariant[];
}) {
  const { data: warehouses } = useVendorWarehouses();
  const { mutateAsync: restock, isPending: restocking } = useRestockInventory();
  const { mutateAsync: adjust, isPending: adjusting } = useAdjustInventory();

  const hasVariants = variants.length > 0;
  const [selectedVariantId, setSelectedVariantId] = useState<string>("");
  // With variants, stock lives per variant; default to the first one.
  const variantId = hasVariants
    ? variants.some((v) => v.id === selectedVariantId)
      ? selectedVariantId
      : variants[0].id
    : null;
  const rows = rowsForSellable(inventoryRecords, variantId);
  const defaultWarehouseId = warehouses?.find((w) => w.is_default)?.id ?? "";

  const [warehouseId, setWarehouseId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Always target a warehouse explicitly, so the server never has to infer one.
  const targetWarehouse = warehouseId || rows[0]?.warehouse_id || defaultWarehouseId;
  const busy = restocking || adjusting;
  const amount = Number(quantity);
  const { canRestock, canAdjust } = inventoryButtonState({ targetWarehouse, quantity, busy });
  // Stock already on hand in the targeted warehouse — the delta a one-click
  // "out of stock" has to subtract. Nothing to zero when it's already 0.
  const targetOnHand = onHandForWarehouse(rows, targetWarehouse);
  const canMarkOutOfStock = Boolean(targetWarehouse) && targetOnHand > 0 && !busy;

  async function run(action: "restock" | "adjust") {
    setError(null);
    try {
      if (action === "restock") {
        await restock({
          product_id: productId,
          ...(variantId ? { variant_id: variantId } : {}),
          warehouse_id: targetWarehouse,
          quantity: Math.abs(amount),
        });
      } else {
        await adjust({
          product_id: productId,
          ...(variantId ? { variant_id: variantId } : {}),
          warehouse_id: targetWarehouse,
          quantity: amount,
          reason: reason.trim() || "Vendor stock adjustment",
        });
      }
      setQuantity("");
      setReason("");
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "Could not update stock. Try again.");
    }
  }

  // One-click zeroing: adjust the targeted warehouse down by exactly its on-hand.
  async function markOutOfStock() {
    if (targetOnHand <= 0) return;
    setError(null);
    try {
      await adjust({
        product_id: productId,
        ...(variantId ? { variant_id: variantId } : {}),
        warehouse_id: targetWarehouse,
        quantity: -targetOnHand,
        reason: "Marked out of stock",
      });
      setQuantity("");
      setReason("");
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "Could not update stock. Try again.");
    }
  }

  return (
    <Card className="border-gray-200 shadow-sm">
      <CardHeader>
        <CardTitle className="text-sm font-medium uppercase tracking-wide text-gray-500">
          Inventory
        </CardTitle>
      </CardHeader>
      <CardContent>
        {hasVariants ? (
          <div className="mb-4">
            <Label htmlFor="inventory-variant" className="text-sm font-medium text-gray-700">
              Variant
            </Label>
            <select
              id="inventory-variant"
              value={variantId ?? ""}
              onChange={(e) => setSelectedVariantId(e.target.value)}
              className="mt-1 w-full max-w-md rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
            >
              {variants.map((v) => {
                const onHand = rowsForSellable(inventoryRecords, v.id).reduce(
                  (sum, r) => sum + (r.quantity_on_hand ?? 0),
                  0,
                );
                return (
                  <option key={v.id} value={v.id}>
                    {variantLabel(v)} · {onHand} on hand
                  </option>
                );
              })}
            </select>
            <p className="mt-1 text-xs text-gray-500">
              Stock is kept per variant. Pick one to see and change its stock.
            </p>
          </div>
        ) : null}
        {rows.length === 0 ? (
          <p className="text-sm text-gray-500">
            No stock recorded yet. Restock below to create the first record.
          </p>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-gray-500">
                  <th className="text-left py-1.5 font-medium">Warehouse</th>
                  <th className="text-right py-1.5 font-medium">On hand</th>
                  <th className="text-right py-1.5 font-medium">Reserved</th>
                  <th className="text-right py-1.5 font-medium">Available</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((inv) => (
                  <tr key={inv.id} className="border-b border-gray-100">
                    <td className="py-1.5">{warehouseLabel(inv.warehouse_id, warehouses)}</td>
                    <td className="py-1.5 text-right">{inv.quantity_on_hand}</td>
                    <td className="py-1.5 text-right">{inv.quantity_reserved}</td>
                    <td className="py-1.5 text-right">
                      {Math.max(0, inv.quantity_on_hand - inv.quantity_reserved)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="pt-2 text-xs text-gray-500">
              Total: {rows.length} {rows.length === 1 ? "warehouse record" : "warehouse records"}
            </div>
          </>
        )}

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <Label className="text-sm font-medium text-gray-700">Warehouse</Label>
            <select
              value={targetWarehouse}
              onChange={(e) => setWarehouseId(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
            >
              {(warehouses ?? []).map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                  {w.is_default ? " (default)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-sm font-medium text-gray-700">Quantity</Label>
            <Input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="0"
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-sm font-medium text-gray-700">Reason (adjust only)</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Stock count"
              className="mt-1"
            />
          </div>
        </div>

        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}

        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" disabled={!canRestock} onClick={() => run("restock")}>
            Restock
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!canAdjust}
            onClick={() => run("adjust")}
          >
            Adjust Stock
          </Button>
          <Button
            type="button"
            variant="outline"
            className="ml-auto text-red-600 hover:text-red-700"
            disabled={!canMarkOutOfStock}
            onClick={markOutOfStock}
          >
            Mark out of stock
          </Button>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          Restock adds the quantity. Adjust applies it as a signed change — use a negative number to
          reduce stock. Mark out of stock zeroes the selected warehouse in one click.
        </p>
      </CardContent>
    </Card>
  );
}
