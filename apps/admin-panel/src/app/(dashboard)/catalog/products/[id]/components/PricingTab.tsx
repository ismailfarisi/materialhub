import { useVendorWarehouses } from "@/lib/queries/warehouses";
import {
	Button,
	Card,
	CardContent,
	Input,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	Separator,
	toast,
} from "@materialhub/ui";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import {
	type ProductInventoryAction,
	buildMarkOutOfStockAdjustments,
	buildProductInventoryMutationParams,
	isProductInventorySubmitDisabled,
} from "./PricingTab.helpers";

interface PricingTabProps {
  product: any;
  editing: boolean;
  editPrice: string;
  setEditPrice: (v: string) => void;
  editCompareAtPrice: string;
  setEditCompareAtPrice: (v: string) => void;
  editCostPrice: string;
  setEditCostPrice: (v: string) => void;
  editSku: string;
  setEditSku: (v: string) => void;
  editBarcode: string;
  setEditBarcode: (v: string) => void;
  formatPrice: (fils: number) => string;
  restockInventory: (params: any, options?: any) => void;
  adjustInventory: (params: any, options?: any) => void;
}

export function PricingTab({
  product, editing,
  editPrice, setEditPrice, editCompareAtPrice, setEditCompareAtPrice,
  editCostPrice, setEditCostPrice, editSku, setEditSku, editBarcode, setEditBarcode,
  formatPrice,
  restockInventory,
  adjustInventory,
}: PricingTabProps) {
  const [inventoryAction, setInventoryAction] = useState<ProductInventoryAction | null>(null);
  const [inventoryQty, setInventoryQty] = useState("");
  const [inventoryReason, setInventoryReason] = useState("");
  const [inventoryWarehouseId, setInventoryWarehouseId] = useState("");
  const { data: vendorWarehouses } = useVendorWarehouses(product.vendor_id, false);
  const defaultWarehouseId = vendorWarehouses?.find((w) => w.is_default)?.id ?? "";
  const productInventory = (product.inventoryRecords ?? []).filter((inv: any) => !inv.variant_id);
  const isSimpleProduct = !product.has_variants && (product.variants?.length ?? 0) === 0;

  function resetInventoryAction() {
    setInventoryAction(null);
    setInventoryQty("");
    setInventoryReason("");
  }

  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-cacao mb-1">Price (AED)</label>
            {editing ? (
              <Input type="number" step="0.01" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} />
            ) : (
              <p className="text-sm font-medium">{formatPrice(product.price)}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-cacao mb-1">Compare-at Price</label>
            {editing ? (
              <Input type="number" step="0.01" value={editCompareAtPrice} onChange={(e) => setEditCompareAtPrice(e.target.value)} />
            ) : (
              <p className="text-sm">{product.compare_at_price ? formatPrice(product.compare_at_price) : "—"}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-cacao mb-1">Cost Price</label>
            {editing ? (
              <Input type="number" step="0.01" value={editCostPrice} onChange={(e) => setEditCostPrice(e.target.value)} />
            ) : (
              <p className="text-sm">{product.cost_price ? formatPrice(product.cost_price) : "—"}</p>
            )}
          </div>
        </div>
        <Separator />
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-cacao mb-1">SKU</label>
            {editing ? (
              <Input value={editSku} onChange={(e) => setEditSku(e.target.value)} />
            ) : (
              <p className="text-sm">{product.sku || "—"}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-cacao mb-1">Barcode</label>
            {editing ? (
              <Input value={editBarcode} onChange={(e) => setEditBarcode(e.target.value)} />
            ) : (
              <p className="text-sm">{product.barcode || "—"}</p>
            )}
          </div>
        </div>
        {isSimpleProduct && (
          <>
            <Separator />
            <div className="space-y-3">
              <div>
                <h4 className="text-xs font-semibold text-taupe uppercase tracking-wider mb-2">
                  Inventory
                </h4>
                {productInventory.length > 0 ? (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-taupe uppercase tracking-wider border-b border-gray-200">
                        <th className="text-left py-1.5 font-medium">Warehouse</th>
                        <th className="text-right py-1.5 font-medium">On Hand</th>
                        <th className="text-right py-1.5 font-medium">Reserved</th>
                        <th className="text-right py-1.5 font-medium">Available</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productInventory.map((inv: any, index: number) => (
                        <tr key={inv.id ?? index} className="border-b border-gray-100">
                          <td className="py-1.5 text-cacao">
                            {/* `Inventory` has no `warehouse` relation, so
                                inv.warehouse was always undefined and this cell
                                always rendered the id fragment. Resolve the name
                                from the list this tab already fetches. */}
                            {vendorWarehouses?.find((w) => w.id === inv.warehouse_id)?.name ??
                              "Unassigned"}
                          </td>
                          <td className="py-1.5 text-right text-cacao">
                            {inv.quantity_on_hand ?? 0}
                          </td>
                          <td className="py-1.5 text-right text-cacao">
                            {inv.quantity_reserved ?? 0}
                          </td>
                          <td className="py-1.5 text-right text-cacao">
                            {inv.quantity_available ??
                              Math.max(
                                0,
                                (inv.quantity_on_hand ?? 0) - (inv.quantity_reserved ?? 0),
                              )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-xs text-taupe">No inventory data available.</p>
                )}
              </div>
              {editing && (
                <div className="space-y-2">
                  {!inventoryAction ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setInventoryAction("restock")}
                      >
                        <Plus size={14} className="mr-1" /> Restock
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setInventoryAction("adjust")}
                      >
                        Adjust Stock
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="ml-auto text-red-600 hover:text-red-700"
                        disabled={
                          buildMarkOutOfStockAdjustments(product.id, productInventory).length === 0
                        }
                        onClick={() => {
                          const adjustments = buildMarkOutOfStockAdjustments(
                            product.id,
                            productInventory,
                          );
                          if (adjustments.length === 0) return;
                          for (const params of adjustments) {
                            adjustInventory(params, {
                              onError: (err: any) =>
                                toast({
                                  title: "Error",
                                  description: err?.response?.data?.message ?? "Failed",
                                  variant: "destructive",
                                }),
                            });
                          }
                          toast({ title: "Marked out of stock" });
                        }}
                      >
                        Mark out of stock
                      </Button>
                    </div>
                  ) : (
                    <div className="p-3 rounded-lg border border-gray-200 bg-linen space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-cacao">
                          {inventoryAction === "restock" ? "Restock Inventory" : "Adjust Stock"}
                        </p>
                        <button
                          type="button"
                          onClick={resetInventoryAction}
                          className="text-taupe hover:text-taupe"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                      <div className="flex items-end gap-2 flex-wrap">
                        {(vendorWarehouses ?? []).length > 0 && (
                          <div className="w-44">
                            <label className="block text-xs text-taupe mb-0.5">Warehouse</label>
                            <Select
                              value={inventoryWarehouseId || defaultWarehouseId}
                              onValueChange={setInventoryWarehouseId}
                            >
                              <SelectTrigger className="h-8 text-sm">
                                <SelectValue placeholder="Default" />
                              </SelectTrigger>
                              <SelectContent>
                                {(vendorWarehouses ?? []).map((w) => (
                                  <SelectItem key={w.id} value={w.id}>
                                    {w.name}
                                    {w.is_default ? " (default)" : ""}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                        <div className="w-28">
                          <label className="block text-xs text-taupe mb-0.5">
                            {inventoryAction === "restock" ? "Quantity" : "Qty (+/-)"}
                          </label>
                          <Input
                            type="number"
                            value={inventoryQty}
                            onChange={(e) => setInventoryQty(e.target.value)}
                            placeholder={inventoryAction === "restock" ? "50" : "-10"}
                            className="h-8 text-sm"
                            min={inventoryAction === "restock" ? 1 : undefined}
                          />
                        </div>
                        {inventoryAction === "adjust" && (
                          <div className="flex-1">
                            <label className="block text-xs text-taupe mb-0.5">Reason</label>
                            <Input
                              value={inventoryReason}
                              onChange={(e) => setInventoryReason(e.target.value)}
                              placeholder="e.g. Damaged goods, stock count correction"
                              className="h-8 text-sm"
                            />
                          </div>
                        )}
                        <Button
                          size="sm"
                          className="h-8"
                          disabled={isProductInventorySubmitDisabled({
                            action: inventoryAction,
                            quantity: inventoryQty,
                            reason: inventoryReason,
                          })}
                          onClick={() => {
                            if (!inventoryAction) return;
                            const action = inventoryAction;
                            const params = buildProductInventoryMutationParams({
                              productId: product.id,
                              action,
                              quantity: inventoryQty,
                              reason: inventoryReason,
                              warehouseId: inventoryWarehouseId || defaultWarehouseId,
                            });
                            const fn = action === "restock" ? restockInventory : adjustInventory;
                            fn(params, {
                              onSuccess: () => {
                                toast({
                                  title: action === "restock" ? "Stock added" : "Stock adjusted",
                                });
                                resetInventoryAction();
                              },
                              onError: (err: any) =>
                                toast({
                                  title: "Error",
                                  description: err?.response?.data?.message ?? "Failed",
                                  variant: "destructive",
                                }),
                            });
                          }}
                        >
                          {inventoryAction === "restock" ? "Add Stock" : "Apply"}
                        </Button>
                      </div>
                      {inventoryAction === "adjust" && (
                        <p className="text-xs text-taupe">
                          Use positive numbers to add, negative to remove.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
