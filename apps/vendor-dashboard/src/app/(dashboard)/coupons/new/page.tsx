"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  toast,
} from "@materialhub/ui";
import { ArrowLeft } from "@phosphor-icons/react";
import { useCreateVendorCoupon } from "@/lib/queries/promotions";
import { EntityMultiCombobox } from "@/components/ui/entity-combobox";
import {
  searchVendorProductsLookup,
  getVendorProductByIdLookup,
} from "@/lib/queries/lookups";

export default function NewCouponPage() {
  const router = useRouter();
  const { mutate: createCoupon, isPending } = useCreateVendorCoupon();

  const [form, setForm] = useState({
    code: "",
    name: "",
    description: "",
    type: "percentage",
    discount_value: "",
    max_discount_amount: "",
    minimum_order_amount: "",
    minimum_quantity: "",
    usage_limit: "",
    usage_limit_per_user: "",
    is_single_use: false,
    starts_at: "",
    expires_at: "",
    is_active: true,
  });
  const [productIds, setProductIds] = useState<string[]>([]);
  const [excludedProductIds, setExcludedProductIds] = useState<string[]>([]);

  function set(key: string, value: string | boolean) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const payload: Record<string, unknown> = {
      code: form.code.trim().toUpperCase(),
      name: form.name.trim() || undefined,
      description: form.description.trim() || undefined,
      type: form.type,
      discount_value: form.discount_value ? Number(form.discount_value) : undefined,
      max_discount_amount: form.max_discount_amount ? Math.round(Number(form.max_discount_amount) * 100) : undefined,
      minimum_order_amount: form.minimum_order_amount ? Math.round(Number(form.minimum_order_amount) * 100) : undefined,
      minimum_quantity: form.minimum_quantity ? Number(form.minimum_quantity) : undefined,
      usage_limit: form.usage_limit ? Number(form.usage_limit) : undefined,
      usage_limit_per_user: form.usage_limit_per_user ? Number(form.usage_limit_per_user) : undefined,
      is_single_use: form.is_single_use,
      starts_at: form.starts_at || undefined,
      expires_at: form.expires_at || undefined,
      is_active: form.is_active,
    };

    if (productIds.length > 0) payload.product_ids = productIds;
    if (excludedProductIds.length > 0) payload.excluded_product_ids = excludedProductIds;

    // discount_value for percentage is the raw number; for fixed_amount convert from AED to fils
    if (form.type === "fixed_amount" && form.discount_value) {
      payload.discount_value = Math.round(Number(form.discount_value) * 100);
    }

    createCoupon(payload, {
      onSuccess: () => {
        toast({ title: "Coupon created successfully" });
        router.push("/coupons");
      },
      onError: (err: any) => {
        toast({
          title: "Failed to create coupon",
          description: err?.response?.data?.message ?? err.message,
          variant: "destructive",
        });
      },
    });
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/coupons">
            <ArrowLeft size={16} className="mr-1" />
            Back
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">New Coupon</h1>
          <p className="text-sm text-gray-500">Create a discount coupon for your products</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle>Basic Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">Code *</label>
                <Input
                  required
                  placeholder="e.g. SAVE20"
                  value={form.code}
                  onChange={(e) => set("code", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Name</label>
                <Input
                  placeholder="e.g. Summer Sale 20%"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Description</label>
              <Input
                placeholder="Optional internal note"
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Discount */}
        <Card>
          <CardHeader>
            <CardTitle>Discount</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Discount Type *</label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={form.type}
                onChange={(e) => set("type", e.target.value)}
              >
                <option value="percentage">Percentage (%)</option>
                <option value="fixed_amount">Fixed Amount (AED)</option>
                <option value="free_shipping">Free Shipping</option>
              </select>
            </div>
            {form.type !== "free_shipping" && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium">
                    Discount Value *{" "}
                    {form.type === "percentage" ? "(%)" : "(AED)"}
                  </label>
                  <Input
                    required
                    type="number"
                    min="0"
                    step={form.type === "percentage" ? "1" : "0.01"}
                    placeholder={form.type === "percentage" ? "e.g. 20" : "e.g. 15.00"}
                    value={form.discount_value}
                    onChange={(e) => set("discount_value", e.target.value)}
                  />
                </div>
                {form.type === "percentage" && (
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Max Discount Amount (AED)</label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="e.g. 50.00"
                      value={form.max_discount_amount}
                      onChange={(e) => set("max_discount_amount", e.target.value)}
                    />
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Products */}
        <Card>
          <CardHeader>
            <CardTitle>Applicable Products</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Products</label>
              <EntityMultiCombobox
                values={productIds}
                onChange={setProductIds}
                search={searchVendorProductsLookup}
                getById={getVendorProductByIdLookup}
                placeholder="Search your products…"
              />
              <p className="text-xs text-muted-foreground">Leave empty to apply to all your products.</p>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Excluded Products</label>
              <EntityMultiCombobox
                values={excludedProductIds}
                onChange={setExcludedProductIds}
                search={searchVendorProductsLookup}
                getById={getVendorProductByIdLookup}
                placeholder="Search products to exclude…"
              />
            </div>
          </CardContent>
        </Card>

        {/* Conditions */}
        <Card>
          <CardHeader>
            <CardTitle>Conditions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">Minimum Order Amount (AED)</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="e.g. 100.00"
                  value={form.minimum_order_amount}
                  onChange={(e) => set("minimum_order_amount", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Minimum Quantity</label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="e.g. 2"
                  value={form.minimum_quantity}
                  onChange={(e) => set("minimum_quantity", e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Usage Limits */}
        <Card>
          <CardHeader>
            <CardTitle>Usage Limits</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">Total Usage Limit</label>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  placeholder="Unlimited"
                  value={form.usage_limit}
                  onChange={(e) => set("usage_limit", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Per-User Limit</label>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  placeholder="Unlimited"
                  value={form.usage_limit_per_user}
                  onChange={(e) => set("usage_limit_per_user", e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="is_single_use"
                type="checkbox"
                className="rounded"
                checked={form.is_single_use}
                onChange={(e) => set("is_single_use", e.target.checked)}
              />
              <label htmlFor="is_single_use" className="text-sm">
                Single-use coupon (each code can only be used once total)
              </label>
            </div>
          </CardContent>
        </Card>

        {/* Schedule */}
        <Card>
          <CardHeader>
            <CardTitle>Schedule &amp; Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">Starts At</label>
                <Input
                  type="datetime-local"
                  value={form.starts_at}
                  onChange={(e) => set("starts_at", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Expires At</label>
                <Input
                  type="datetime-local"
                  value={form.expires_at}
                  onChange={(e) => set("expires_at", e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="is_active"
                type="checkbox"
                className="rounded"
                checked={form.is_active}
                onChange={(e) => set("is_active", e.target.checked)}
              />
              <label htmlFor="is_active" className="text-sm">
                Active (coupon is live and usable)
              </label>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3 pb-4">
          <Button type="button" variant="outline" asChild>
            <Link href="/coupons">Cancel</Link>
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Creating…" : "Create Coupon"}
          </Button>
        </div>
      </form>
    </div>
  );
}
