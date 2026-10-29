"use client";

import { VendorProductTabs } from "@/components/products/VendorProductTabs";
import { useVendorProduct } from "@/lib/queries/products";
import { Skeleton } from "@materialhub/ui";
import { useParams } from "next/navigation";
import { useMemo } from "react";

export default function EditProductPage() {
  const { id } = useParams<{ id: string }>();
  const { data: product, isLoading } = useVendorProduct(id);

  const defaultValues = useMemo(() => {
    if (!product) return undefined;

    // Map images from API (could be objects with id/url/alt_text or plain strings)
    const images = Array.isArray(product.images)
      ? product.images.map((img: any) =>
          typeof img === "string"
            ? { url: img, alt_text: undefined, is_primary: false }
            : {
                id: img.id,
                url: img.url,
                alt_text: img.alt_text ?? undefined,
                is_primary: img.is_primary ?? false,
              },
        )
      : [];

    // Map existing variants
    const variants = Array.isArray(product.variants)
      ? product.variants.map((v: any) => ({
          id: v.id,
          name: v.name ?? "",
          sku: v.sku ?? undefined,
          price: v.price ?? undefined,
          compare_at_price: v.compare_at_price ?? undefined,
          option_values: v.option_values ?? undefined,
          is_active: v.is_active ?? true,
        }))
      : [];
    const inventoryRecords = Array.isArray(product.inventoryRecords)
      ? product.inventoryRecords
      : [];
    // Existing descriptive attribute values, so the attributes editor hydrates
    // instead of starting blank (a blank save would wipe stored attributes).
    const attributeValues = Array.isArray(product.attributeValues)
      ? product.attributeValues.map((av: any) => ({
          attribute_id: av.attribute_id,
          attribute_value_id: av.attribute_value_id ?? null,
          text_value: av.text_value ?? null,
          variant_id: av.variant_id ?? null,
        }))
      : [];
    const quantityOnHand = inventoryRecords
      .filter((record: any) => !record.variant_id)
      .reduce((sum: number, record: any) => sum + (record.quantity_on_hand ?? 0), 0);

    return {
      name: product.name ?? "",
      description: product.description ?? "",
      category_id: product.category_id ?? "",
      brand_id: product.brand_id ?? "",
      // API stores price in fils — convert to AED for display
      base_price:
        product.base_price != null
          ? product.base_price / 100
          : product.price != null
            ? product.price / 100
            : 0,
      compare_at_price:
        product.compare_at_price != null ? product.compare_at_price / 100 : ("" as const),
      sku: product.sku ?? "",
      barcode: product.barcode ?? "",
      weight:
        product.weight != null
          ? product.weight
          : product.weight_grams != null
            ? product.weight_grams
            : ("" as const),
      tags: Array.isArray(product.tags) ? product.tags.join(", ") : (product.tags ?? ""),
      images,
      // Variant data
      has_variants: product.has_variants ?? variants.length > 0,
      variants,
      inventoryRecords,
      quantity_on_hand: quantityOnHand,
      attributeValues,
      // SEO data
      meta_title: product.meta_title ?? "",
      meta_description: product.meta_description ?? "",
      meta_keywords: Array.isArray(product.meta_keywords)
        ? product.meta_keywords.join(", ")
        : (product.meta_keywords ?? ""),
      // New fields
      editorial: product.editorial ?? null,
      short_description: product.short_description ?? undefined,
      rich_description: product.rich_description ?? undefined,
      ingredients: product.ingredients ?? undefined,
      usage_instructions: product.usage_instructions ?? undefined,
      cost_price: product.cost_price ? product.cost_price / 100 : undefined,
      dimensions_cm: product.dimensions_cm ?? undefined,
      country_of_origin: product.country_of_origin ?? undefined,
      is_digital: product.is_digital ?? false,
      is_customizable: product.is_customizable ?? false,
    };
  }, [product]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Pencil Product</h1>
        <p className="text-sm text-gray-500">Update your product details.</p>
      </div>

      {isLoading ? (
        <div className="space-y-4 max-w-3xl">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : product ? (
        <VendorProductTabs
          productId={id}
          defaultValues={defaultValues}
          variants={
            product?.variants?.map((v: any) => ({
              id: v.id ?? "",
              name: v.name,
            })) ?? []
          }
        />
      ) : (
        <p className="text-muted-foreground">Product not found.</p>
      )}
    </div>
  );
}
