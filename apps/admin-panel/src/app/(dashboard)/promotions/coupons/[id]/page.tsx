"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import {
  Button,
  Input,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
} from "@materialhub/ui";
import { ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import { toast } from "@materialhub/ui";
import { couponMoneyFromInput, couponMoneyToInput } from "@/lib/coupon-money";
import { useAdminCoupon, useUpdateCoupon } from "@/lib/queries/promotions";
import { EntityMultiCombobox } from "@/components/ui/entity-combobox";
import {
  searchAdminProductsLookup,
  getAdminProductByIdLookup,
  searchAdminCategoriesLookup,
  getAdminCategoryByIdLookup,
  searchAdminVendorsLookup,
  getAdminVendorByIdLookup,
} from "@/lib/queries/lookups";

type CouponType = "percentage" | "fixed_amount" | "free_shipping" | "buy_x_get_y";
type ApplicableTo = "all" | "specific_products" | "specific_categories" | "specific_vendors";

function generateCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toISOString().slice(0, 16);
}

export default function EditCouponPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const { data: coupon, isLoading, isError } = useAdminCoupon(id);
  const { mutate: updateCoupon, isPending } = useUpdateCoupon();
  const [error, setError] = useState("");
  const [hydrated, setHydrated] = useState(false);

  // Section 1 — Basic Info
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [isPublic, setIsPublic] = useState(true);

  // Section 2 — Discount Config
  const [type, setType] = useState<CouponType>("percentage");
  const [discountValue, setDiscountValue] = useState("");
  const [maxDiscountAmount, setMaxDiscountAmount] = useState("");
  const [buyQuantity, setBuyQuantity] = useState("");
  const [getQuantity, setGetQuantity] = useState("");
  const [getDiscountPercentage, setGetDiscountPercentage] = useState("100");

  // Section 3 — Targeting
  const [applicableTo, setApplicableTo] = useState<ApplicableTo>("all");
  const [productIds, setProductIds] = useState<string[]>([]);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [vendorIds, setVendorIds] = useState<string[]>([]);
  const [excludedProductIds, setExcludedProductIds] = useState<string[]>([]);

  // Section 4 — Restrictions
  const [minimumOrderAmount, setMinimumOrderAmount] = useState("");
  const [minimumQuantity, setMinimumQuantity] = useState("");
  const [usageLimit, setUsageLimit] = useState("");
  const [usageLimitPerUser, setUsageLimitPerUser] = useState("");
  const [isSingleUse, setIsSingleUse] = useState(false);
  const [firstOrderOnly, setFirstOrderOnly] = useState(false);
  const [newUsersOnly, setNewUsersOnly] = useState(false);

  // Section 5 — Schedule
  const [startsAt, setStartsAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  // Prefill once data loads
  useEffect(() => {
    if (!coupon || hydrated) return;
    setCode(coupon.code ?? "");
    setName(coupon.name ?? "");
    setDescription(coupon.description ?? "");
    setIsActive(coupon.is_active ?? true);
    setIsPublic(coupon.is_public ?? true);
    setType(coupon.type ?? "percentage");
    const money = couponMoneyToInput(coupon);
    setDiscountValue(money.discountValue);
    setMaxDiscountAmount(money.maxDiscountAed);
    setBuyQuantity(coupon.buy_quantity != null ? String(coupon.buy_quantity) : "");
    setGetQuantity(coupon.get_quantity != null ? String(coupon.get_quantity) : "");
    setGetDiscountPercentage(coupon.get_discount_percentage != null ? String(coupon.get_discount_percentage) : "100");
    setApplicableTo(coupon.applicable_to ?? "all");
    setProductIds(Array.isArray(coupon.product_ids) ? coupon.product_ids : []);
    setCategoryIds(Array.isArray(coupon.category_ids) ? coupon.category_ids : []);
    setVendorIds(Array.isArray(coupon.vendor_ids) ? coupon.vendor_ids : []);
    setExcludedProductIds(Array.isArray(coupon.excluded_product_ids) ? coupon.excluded_product_ids : []);
    setMinimumOrderAmount(money.minimumOrderAed);
    setMinimumQuantity(coupon.minimum_quantity != null ? String(coupon.minimum_quantity) : "");
    setUsageLimit(coupon.usage_limit != null ? String(coupon.usage_limit) : "");
    setUsageLimitPerUser(coupon.usage_limit_per_user != null ? String(coupon.usage_limit_per_user) : "");
    setIsSingleUse(coupon.is_single_use ?? false);
    setFirstOrderOnly(coupon.first_order_only ?? false);
    setNewUsersOnly(coupon.new_users_only ?? false);
    setStartsAt(toDatetimeLocal(coupon.starts_at));
    setExpiresAt(toDatetimeLocal(coupon.expires_at));
    setHydrated(true);
  }, [coupon, hydrated]);

  function handleSubmit() {
    setError("");
    if (!code.trim()) { setError("Coupon code is required."); return; }
    if (!name.trim()) { setError("Coupon name is required."); return; }
    const money = couponMoneyFromInput({
      type,
      discountValue,
      maxDiscountAed: maxDiscountAmount,
      minimumOrderAed: minimumOrderAmount,
    });
    if (!money.ok) { setError(money.error); return; }

    const payload: Record<string, any> = {
      id,
      code: code.trim().toUpperCase(),
      name: name.trim(),
      description: description || undefined,
      is_active: isActive,
      is_public: isPublic,
      type,
      discount_value: money.values.discount_value,
      max_discount_amount: money.values.max_discount_amount,
      applicable_to: applicableTo,
      product_ids: applicableTo === "specific_products" ? productIds : undefined,
      category_ids: applicableTo === "specific_categories" ? categoryIds : undefined,
      vendor_ids: applicableTo === "specific_vendors" ? vendorIds : undefined,
      excluded_product_ids: excludedProductIds.length > 0 ? excludedProductIds : undefined,
      minimum_order_amount: money.values.minimum_order_amount,
      minimum_quantity: minimumQuantity ? Number(minimumQuantity) : undefined,
      usage_limit: usageLimit ? Number(usageLimit) : undefined,
      usage_limit_per_user: usageLimitPerUser ? Number(usageLimitPerUser) : undefined,
      is_single_use: isSingleUse,
      first_order_only: firstOrderOnly,
      new_users_only: newUsersOnly,
      starts_at: startsAt ? new Date(startsAt).toISOString() : undefined,
      expires_at: expiresAt ? new Date(expiresAt).toISOString() : undefined,
    };

    if (type === "buy_x_get_y") {
      payload.buy_quantity = buyQuantity ? Number(buyQuantity) : undefined;
      payload.get_quantity = getQuantity ? Number(getQuantity) : undefined;
      payload.get_discount_percentage = getDiscountPercentage ? Number(getDiscountPercentage) : 100;
    }

    updateCoupon(payload, {
      onSuccess: () => {
        toast({ title: "Coupon updated", description: "Changes saved successfully." });
        router.push("/promotions/coupons");
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.message ?? "Failed to update coupon.";
        setError(msg);
        toast({ title: "Error", description: msg, variant: "destructive" });
      },
    });
  }

  if (!isLoading && (isError || !coupon)) {
    return (
      <div className="max-w-3xl space-y-4 py-12 text-center">
        <h1 className="text-xl font-semibold text-cacao">Coupon not found</h1>
        <p className="text-sm text-taupe">
          This coupon doesn&apos;t exist or was deleted.
        </p>
        <Button variant="outline" asChild>
          <Link href="/promotions/coupons">Back to coupons</Link>
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-3xl">
        <Skeleton className="h-10 w-64 rounded-lg" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-40 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild className="p-2">
          <Link href="/promotions/coupons">
            <ArrowLeft size={18} />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-cacao">Edit Coupon</h1>
          <p className="text-taupe text-sm font-mono">{coupon?.code}</p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">{error}</div>
      )}

      {/* Section 1: Basic Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-cacao uppercase tracking-wide">Basic Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-cacao mb-1">Code *</label>
            <div className="flex gap-2">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="SUMMER20"
                className="font-mono uppercase"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCode(generateCode())}
                className="gap-1.5 whitespace-nowrap"
              >
                <RefreshCw size={13} />
                Generate
              </Button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-cacao mb-1">Name *</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Summer Sale 20%" />
          </div>
          <div>
            <label className="block text-sm font-medium text-cacao mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description..."
              rows={3}
              className="w-full rounded-md border border-gray-300 bg-linen px-3 py-2 text-sm shadow-sm placeholder:text-taupe focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
            />
          </div>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="rounded" />
              Active
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} className="rounded" />
              Public (visible in storefront)
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Section 2: Discount Config */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-cacao uppercase tracking-wide">Discount Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-cacao mb-2">Type</label>
            <div className="flex flex-wrap gap-3">
              {(
                [
                  { label: "Percentage", value: "percentage" },
                  { label: "Fixed Amount", value: "fixed_amount" },
                  { label: "Free Shipping", value: "free_shipping" },
                  { label: "Buy X Get Y", value: "buy_x_get_y" },
                ] as { label: string; value: CouponType }[]
              ).map((opt) => (
                <label key={opt.value} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="coupon_type"
                    checked={type === opt.value}
                    onChange={() => setType(opt.value)}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          {(type === "percentage" || type === "fixed_amount") && (
            <div>
              <label className="block text-sm font-medium text-cacao mb-1">
                {type === "percentage" ? "Discount %" : "Discount amount (AED)"}
              </label>
              <Input
                type="number"
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                placeholder={type === "percentage" ? "20" : "50.00"}
                step={type === "percentage" ? 1 : 0.01}
                min={0}
              />
            </div>
          )}

          {type === "percentage" && (
            <div>
              <label className="block text-sm font-medium text-cacao mb-1">Max discount (AED)</label>
              <Input
                type="number"
                value={maxDiscountAmount}
                onChange={(e) => setMaxDiscountAmount(e.target.value)}
                placeholder="Optional cap, e.g. 100.00"
                step={0.01}
                min={0}
              />
            </div>
          )}

          {type === "buy_x_get_y" && (
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-cacao mb-1">Buy Quantity</label>
                <Input type="number" value={buyQuantity} onChange={(e) => setBuyQuantity(e.target.value)} placeholder="2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-cacao mb-1">Get Quantity</label>
                <Input type="number" value={getQuantity} onChange={(e) => setGetQuantity(e.target.value)} placeholder="1" />
              </div>
              <div>
                <label className="block text-sm font-medium text-cacao mb-1">Get Discount %</label>
                <Input
                  type="number"
                  value={getDiscountPercentage}
                  onChange={(e) => setGetDiscountPercentage(e.target.value)}
                  placeholder="100"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 3: Targeting */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-cacao uppercase tracking-wide">Targeting</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-cacao mb-2">Applicable To</label>
            <div className="flex flex-wrap gap-3">
              {(
                [
                  { label: "All", value: "all" },
                  { label: "Specific Products", value: "specific_products" },
                  { label: "Specific Categories", value: "specific_categories" },
                  { label: "Specific Vendors", value: "specific_vendors" },
                ] as { label: string; value: ApplicableTo }[]
              ).map((opt) => (
                <label key={opt.value} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="applicable_to"
                    checked={applicableTo === opt.value}
                    onChange={() => setApplicableTo(opt.value)}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          {applicableTo === "specific_products" && (
            <div>
              <label className="block text-sm font-medium text-cacao mb-1">Products</label>
              <EntityMultiCombobox
                values={productIds}
                onChange={setProductIds}
                search={searchAdminProductsLookup}
                getById={getAdminProductByIdLookup}
                placeholder="Search products by name or SKU…"
              />
            </div>
          )}

          {applicableTo === "specific_categories" && (
            <div>
              <label className="block text-sm font-medium text-cacao mb-1">Categories</label>
              <EntityMultiCombobox
                values={categoryIds}
                onChange={setCategoryIds}
                search={searchAdminCategoriesLookup}
                getById={getAdminCategoryByIdLookup}
                placeholder="Search categories…"
              />
            </div>
          )}

          {applicableTo === "specific_vendors" && (
            <div>
              <label className="block text-sm font-medium text-cacao mb-1">Vendors</label>
              <EntityMultiCombobox
                values={vendorIds}
                onChange={setVendorIds}
                search={searchAdminVendorsLookup}
                getById={getAdminVendorByIdLookup}
                placeholder="Search vendors by business name or email…"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-cacao mb-1">Excluded Products</label>
            <EntityMultiCombobox
              values={excludedProductIds}
              onChange={setExcludedProductIds}
              search={searchAdminProductsLookup}
              getById={getAdminProductByIdLookup}
              placeholder="Search products to exclude…"
            />
            <p className="mt-1 text-xs text-taupe">Products to exclude from this coupon.</p>
          </div>
        </CardContent>
      </Card>

      {/* Section 4: Restrictions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-cacao uppercase tracking-wide">Restrictions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-cacao mb-1">Minimum order (AED)</label>
              <Input
                type="number"
                value={minimumOrderAmount}
                onChange={(e) => setMinimumOrderAmount(e.target.value)}
                placeholder="0.00"
                step={0.01}
                min={0}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-cacao mb-1">Minimum Quantity</label>
              <Input
                type="number"
                value={minimumQuantity}
                onChange={(e) => setMinimumQuantity(e.target.value)}
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-cacao mb-1">Usage Limit (total)</label>
              <Input
                type="number"
                value={usageLimit}
                onChange={(e) => setUsageLimit(e.target.value)}
                placeholder="Unlimited"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-cacao mb-1">Usage Limit Per User</label>
              <Input
                type="number"
                value={usageLimitPerUser}
                onChange={(e) => setUsageLimitPerUser(e.target.value)}
                placeholder="Unlimited"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isSingleUse} onChange={(e) => setIsSingleUse(e.target.checked)} className="rounded" />
              Single Use (one-time code)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={firstOrderOnly} onChange={(e) => setFirstOrderOnly(e.target.checked)} className="rounded" />
              First Order Only
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={newUsersOnly} onChange={(e) => setNewUsersOnly(e.target.checked)} className="rounded" />
              New Users Only
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Section 5: Schedule */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-cacao uppercase tracking-wide">Schedule</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-cacao mb-1">Starts At</label>
              <Input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-cacao mb-1">Expires At</label>
              <Input
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Submit */}
      <div className="flex items-center justify-between">
        <Button variant="outline" asChild>
          <Link href="/promotions/coupons">
            <ArrowLeft size={16} className="mr-1.5" />
            Back
          </Link>
        </Button>
        <Button onClick={handleSubmit} disabled={isPending}>
          {isPending && <Loader2 size={16} className="mr-1.5 animate-spin" />}
          {isPending ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}
