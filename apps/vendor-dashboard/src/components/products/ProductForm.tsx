"use client";

import { EntityCombobox, type LookupItem } from "@/components/ui/entity-combobox";
import { api } from "@/lib/api";
import { useCreateProduct, useGenerateVariants, useUpdateProduct } from "@/lib/queries/products";
import { s3UploadClient } from "@/lib/s3-upload-client";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EMPTY_VARIANT_MATRIX,
  EditorialEditor,
  Input,
  Label,
  MAX_VARIANT_COMBINATIONS,
  type ProductAttributeDraft,
  ProductAttributesEditor,
  type ProductEditorial,
  Textarea,
  VariantMatrixEditor,
  type VariantMatrixValue,
  buildVariantRowsPayload,
  existingVariantKeys,
  hydrateProductAttributes,
  minVariantPriceFils,
  missingRequiredAttributes,
  rowsMissingPrice,
  serializeProductAttributes,
  splitCategoryAttributes,
  toast,
  variantCombinations,
} from "@materialhub/ui";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CurrencyDollar,
  Globe,
  ImageIcon,
  MagnifyingGlass,
  Package,
  Plus,
  Sparkle,
  Spinner,
  Stack,
  Tag,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type ArabicTranslationDraft,
  buildArabicTranslationsPayload,
  buildSimpleProductInventoryPayload,
} from "./ProductForm.helpers";
import { RequestBrandModal } from "./RequestBrandModal";
import { VendorMediaTab } from "./VendorMediaTab";

/* ──────────────────────────────────────────────────────────────────────
   Types
   ────────────────────────────────────────────────────────────────────── */

interface Category {
  id: string;
  name: string;
  children?: Category[];
}

interface Brand {
  id: string;
  name: string;
  /** Brands this vendor submitted stay `pending` until an admin approves them.
   *  Absent on older payloads, so treat undefined as approved. */
  status?: "pending" | "approved" | "rejected";
  rejection_reason?: string | null;
}

interface ProductImage {
  id?: string;
  url: string;
  alt_text?: string;
  is_primary?: boolean;
}

interface ExistingVariant {
  id: string;
  name: string;
  sku?: string;
  price?: number;
  compare_at_price?: number;
  option_values?: Record<string, string>;
  is_active?: boolean;
}

interface Attribute {
  id: string;
  name: string;
  type: string;
}

interface AttributeValue {
  id: string;
  value: string;
  label?: string;
  display_value?: string | null;
  color_hex?: string | null;
}

interface CategoryAttributeLink {
  attribute: Attribute & { values?: AttributeValue[] };
  is_required?: boolean;
}

interface ProductFormProps {
  productId?: string;
  forceStep?: string;
  defaultValues?: {
    name?: string;
    description?: string;
    short_description?: string;
    rich_description?: string;
    ingredients?: string;
    usage_instructions?: string;
    category_id?: string;
    brand_id?: string;
    base_price?: number;
    compare_at_price?: number | "";
    cost_price?: number | "";
    sku?: string;
    barcode?: string;
    weight?: number | "";
    dimensions_cm?: { length: number; width: number; height: number } | null;
    country_of_origin?: string;
    is_digital?: boolean;
    is_customizable?: boolean;
    tags?: string;
    images?: ProductImage[];
    has_variants?: boolean;
    variants?: ExistingVariant[];
    inventoryRecords?: Array<{
      id?: string;
      variant_id?: string | null;
      warehouse_id?: string | null;
      quantity_on_hand?: number | null;
      quantity_reserved?: number | null;
    }>;
    quantity_on_hand?: number;
    meta_title?: string;
    meta_description?: string;
    meta_keywords?: string;
    translation_ar?: ArabicTranslationDraft;
    editorial?: ProductEditorial | null;
    attributeValues?: Array<{
      attribute_id: string;
      attribute_value_id?: string | null;
      text_value?: string | null;
    }>;
    attribute_values?: Array<{
      attribute_id: string;
      attribute_value_id?: string | null;
      text_value?: string | null;
    }>;
  };
}

/* ──────────────────────────────────────────────────────────────────────
   Helpers
   ────────────────────────────────────────────────────────────────────── */

function flattenCategoriesAsBreadcrumb(cats: Category[], parentPath = ""): LookupItem[] {
  const result: LookupItem[] = [];
  for (const cat of cats) {
    const label = parentPath ? `${parentPath} › ${cat.name}` : cat.name;
    result.push({ id: cat.id, label });
    if (cat.children?.length) result.push(...flattenCategoriesAsBreadcrumb(cat.children, label));
  }
  return result;
}

/* ══════════════════════════════════════════════════════════════════════
   ProductForm Component
   ══════════════════════════════════════════════════════════════════════ */

export function ProductForm({ productId, defaultValues, forceStep }: ProductFormProps) {
  const router = useRouter();
  const isEdit = !!productId;

  // ─── Product type ───────────────────────────────────────────────────
  const [hasVariants, setHasVariants] = useState(defaultValues?.has_variants ?? false);
  const [typeChosen, setTypeChosen] = useState(isEdit);

  // ─── Step state ─────────────────────────────────────────────────────
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // ─── Reference data ─────────────────────────────────────────────────
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [requestingBrand, setRequestingBrand] = useState(false);
  const [categoryAttributes, setCategoryAttributes] = useState<CategoryAttributeLink[]>([]);
  const [productAttributes, setProductAttributes] = useState<ProductAttributeDraft>({});
  const [loadingRefs, setLoadingRefs] = useState(true);

  // Variant-defining attributes (Size, Color…) feed the Variants step;
  // only descriptive ones appear in the attribute editor.
  const { descriptive: descriptiveAttributes, variantAxes } = useMemo(
    () => splitCategoryAttributes(categoryAttributes),
    [categoryAttributes],
  );

  // ─── Product Details ────────────────────────────────────────────────
  const [name, setName] = useState(defaultValues?.name ?? "");
  const [description, setDescription] = useState(defaultValues?.description ?? "");
  const [categoryId, setCategoryId] = useState(defaultValues?.category_id ?? "");
  const [brandId, setBrandId] = useState(defaultValues?.brand_id ?? "");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>(() => {
    if (!defaultValues?.tags) return [];
    return defaultValues.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  });

  // ─── Pricing & Specs ───────────────────────────────────────────────
  const [basePrice, setBasePrice] = useState(
    defaultValues?.base_price != null ? String(defaultValues.base_price) : "",
  );
  const [compareAtPrice, setCompareAtPrice] = useState(
    defaultValues?.compare_at_price ? String(defaultValues.compare_at_price) : "",
  );
  const [sku, setSku] = useState(defaultValues?.sku ?? "");
  const [barcode, setBarcode] = useState(defaultValues?.barcode ?? "");
  const [weight, setWeight] = useState(defaultValues?.weight ? String(defaultValues.weight) : "");
  const [shortDescription, setShortDescription] = useState(defaultValues?.short_description ?? "");
  const [richDescription, setRichDescription] = useState(defaultValues?.rich_description ?? "");
  const [ingredients, setIngredients] = useState(defaultValues?.ingredients ?? "");
  const [usageInstructions, setUsageInstructions] = useState(
    defaultValues?.usage_instructions ?? "",
  );
  const [costPrice, setCostPrice] = useState(
    defaultValues?.cost_price ? String(defaultValues.cost_price) : "",
  );
  const [quantityOnHand, setQuantityOnHand] = useState(
    defaultValues?.quantity_on_hand != null ? String(defaultValues.quantity_on_hand) : "",
  );
  const [dimensionL, setDimensionL] = useState(
    defaultValues?.dimensions_cm?.length != null ? String(defaultValues.dimensions_cm.length) : "",
  );
  const [dimensionW, setDimensionW] = useState(
    defaultValues?.dimensions_cm?.width != null ? String(defaultValues.dimensions_cm.width) : "",
  );
  const [dimensionH, setDimensionH] = useState(
    defaultValues?.dimensions_cm?.height != null ? String(defaultValues.dimensions_cm.height) : "",
  );
  const [countryOfOrigin, setCountryOfOrigin] = useState(defaultValues?.country_of_origin ?? "");
  const [isDigital, setIsDigital] = useState(defaultValues?.is_digital ?? false);
  const [isCustomizable, setIsCustomizable] = useState(defaultValues?.is_customizable ?? false);
  const [editorial, setEditorial] = useState<ProductEditorial | null>(
    defaultValues?.editorial ?? null,
  );
  // ─── Arabic content ────────────────────────────────────────────────
  const emptyArabic: ArabicTranslationDraft = { name: "", short_description: "", description: "" };
  const [arabic, setArabic] = useState<ArabicTranslationDraft>(
    defaultValues?.translation_ar ?? emptyArabic,
  );
  const hadStoredArabic = !!defaultValues?.translation_ar?.name;

  // ─── Variants ───────────────────────────────────────────────────────
  const [variantMatrix, setVariantMatrix] = useState<VariantMatrixValue>(EMPTY_VARIANT_MATRIX);
  const [existingVariants, setExistingVariants] = useState<ExistingVariant[]>(
    defaultValues?.variants ?? [],
  );

  // ─── SEO ────────────────────────────────────────────────────────────
  const [metaTitle, setMetaTitle] = useState(defaultValues?.meta_title ?? "");
  const [metaDescription, setMetaDescription] = useState(defaultValues?.meta_description ?? "");
  const [metaKeywords, setMetaKeywords] = useState(defaultValues?.meta_keywords ?? "");

  // ─── Mutations ──────────────────────────────────────────────────────
  const { mutateAsync: createProduct, isPending: creating } = useCreateProduct();
  const { mutateAsync: updateProduct, isPending: updating } = useUpdateProduct();
  const { mutateAsync: generateVariants, isPending: generatingVariants } = useGenerateVariants();
  const isPending = creating || updating;

  // ─── Dynamic steps ─────────────────────────────────────────────────
  const STEPS = useMemo(() => {
    const steps = [
      { key: "details", label: "Details", icon: Package },
      { key: "pricing", label: "Pricing & Specs", icon: CurrencyDollar },
    ];
    if (hasVariants) {
      steps.push({ key: "variants", label: "Variants", icon: Stack });
    }
    steps.push({ key: "media", label: "Media", icon: ImageIcon });
    steps.push({ key: "editorial", label: "Editorial", icon: Sparkle });
    steps.push({ key: "seo", label: "SEO", icon: Globe });
    return steps;
  }, [hasVariants]);

  // ─── Category & brand options ──────────────────────────────────────
  const categoryItems = useMemo<LookupItem[]>(
    () => flattenCategoriesAsBreadcrumb(categories),
    [categories],
  );
  const brandItems = useMemo<LookupItem[]>(
    () =>
      brands.map((b) => ({
        id: b.id,
        // The vendor's own submissions are selectable but not public yet, and
        // the picker is the only place they'd find that out.
        label:
          b.status === "pending"
            ? `${b.name} (pending review)`
            : b.status === "rejected"
              ? `${b.name} (rejected)`
              : b.name,
      })),
    [brands],
  );

  const searchCategories = useCallback(
    async (q: string) => {
      if (!q) return categoryItems.slice(0, 50);
      const ql = q.toLowerCase();
      return categoryItems.filter((c) => c.label.toLowerCase().includes(ql)).slice(0, 50);
    },
    [categoryItems],
  );
  const getCategoryById = useCallback(
    async (id: string) => categoryItems.find((c) => c.id === id) ?? null,
    [categoryItems],
  );
  const searchBrands = useCallback(
    async (q: string) => {
      if (!q) return brandItems.slice(0, 50);
      const ql = q.toLowerCase();
      return brandItems.filter((b) => b.label.toLowerCase().includes(ql)).slice(0, 50);
    },
    [brandItems],
  );
  const getBrandById = useCallback(
    async (id: string) => brandItems.find((b) => b.id === id) ?? null,
    [brandItems],
  );

  // ─── Load reference data ────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoadingRefs(true);
    Promise.all([
      api.get("/categories/tree").catch(() => ({ data: { data: [] } })),
      // Vendor-scoped: every approved brand plus this vendor's own pending and
      // rejected submissions. The public /brands list omits those.
      api.get("/vendor/brands").catch(() => ({ data: { data: [] } })),
    ]).then(([catRes, brandRes]) => {
      if (!cancelled) {
        setCategories(catRes.data.data ?? []);
        const bd = brandRes.data.data;
        setBrands(Array.isArray(bd) ? bd : (bd?.data ?? []));
        setLoadingRefs(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!categoryId) {
      setCategoryAttributes([]);
      return;
    }

    let cancelled = false;
    api
      .get(`/categories/by-id/${categoryId}/attributes`)
      .then((r) => {
        if (cancelled) return;
        setCategoryAttributes(r.data.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setCategoryAttributes([]);
      });

    return () => {
      cancelled = true;
    };
  }, [categoryId]);

  useEffect(() => {
    const rows = defaultValues?.attributeValues ?? defaultValues?.attribute_values ?? [];
    setProductAttributes(hydrateProductAttributes(rows, categoryAttributes));
  }, [defaultValues, categoryAttributes]);

  // ─── Reset form on defaultValues change (edit mode) ─────────────────
  useEffect(() => {
    if (!defaultValues) return;
    setName(defaultValues.name ?? "");
    setDescription(defaultValues.description ?? "");
    setCategoryId(defaultValues.category_id ?? "");
    setBrandId(defaultValues.brand_id ?? "");
    setBasePrice(defaultValues.base_price != null ? String(defaultValues.base_price) : "");
    setCompareAtPrice(defaultValues.compare_at_price ? String(defaultValues.compare_at_price) : "");
    setSku(defaultValues.sku ?? "");
    setBarcode(defaultValues.barcode ?? "");
    setWeight(defaultValues.weight ? String(defaultValues.weight) : "");
    setTags(
      defaultValues.tags
        ? defaultValues.tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : [],
    );
    setHasVariants(defaultValues.has_variants ?? false);
    setExistingVariants(defaultValues.variants ?? []);
    setMetaTitle(defaultValues.meta_title ?? "");
    setMetaDescription(defaultValues.meta_description ?? "");
    setMetaKeywords(defaultValues.meta_keywords ?? "");
    setShortDescription(defaultValues.short_description ?? "");
    setArabic(defaultValues.translation_ar ?? { name: "", short_description: "", description: "" });
    setRichDescription(defaultValues.rich_description ?? "");
    setIngredients(defaultValues.ingredients ?? "");
    setUsageInstructions(defaultValues.usage_instructions ?? "");
    setCostPrice(defaultValues.cost_price ? String(defaultValues.cost_price) : "");
    setQuantityOnHand(
      defaultValues.quantity_on_hand != null ? String(defaultValues.quantity_on_hand) : "",
    );
    setDimensionL(
      defaultValues.dimensions_cm?.length != null ? String(defaultValues.dimensions_cm.length) : "",
    );
    setDimensionW(
      defaultValues.dimensions_cm?.width != null ? String(defaultValues.dimensions_cm.width) : "",
    );
    setDimensionH(
      defaultValues.dimensions_cm?.height != null ? String(defaultValues.dimensions_cm.height) : "",
    );
    setCountryOfOrigin(defaultValues.country_of_origin ?? "");
    setIsDigital(defaultValues.is_digital ?? false);
    setIsCustomizable(defaultValues.is_customizable ?? false);
    setEditorial(defaultValues.editorial ?? null);
    if (isEdit) setTypeChosen(true);
  }, [defaultValues]);

  // ─── Validation ─────────────────────────────────────────────────────
  function validateStep(s: number): Record<string, string> {
    const errs: Record<string, string> = {};
    const stepKey = STEPS[s]?.key;
    if (stepKey === "details") {
      if (!name.trim()) errs.name = "Product name is required";
      if (!categoryId) errs.category_id = "Category is required";
    }
    if (stepKey === "pricing" && !hasVariants) {
      if (!basePrice || Number(basePrice) < 0)
        errs.base_price = "Price is required and must be 0 or greater";
      if (quantityOnHand.trim() !== "" && Number(quantityOnHand) < 0) {
        errs.quantity_on_hand = "Quantity on hand must be 0 or greater";
      }
    }
    if (stepKey === "variants") {
      const existingKeys = existingVariantKeys(existingVariants);
      const combos = variantCombinations(variantMatrix.axes);
      const newRows = buildVariantRowsPayload(variantMatrix, existingKeys);
      if (combos.length > MAX_VARIANT_COMBINATIONS) {
        errs.variants = `Variant combinations exceed the limit of ${MAX_VARIANT_COMBINATIONS}`;
      } else if (!isEdit && existingVariants.length === 0 && newRows.length === 0) {
        errs.variants = "Add at least one variant option value (e.g. Sheet size: A1, A2)";
      } else {
        const unpriced = rowsMissingPrice(variantMatrix, existingKeys);
        if (unpriced.length > 0) {
          errs.variants = `Set a price for every variant — missing: ${unpriced
            .slice(0, 5)
            .join(", ")}${unpriced.length > 5 ? "…" : ""}`;
        }
      }
    }
    return errs;
  }

  function handleNext() {
    const errs = validateStep(step);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function handleBack() {
    setErrors({});
    if (step > 0) setStep((s) => s - 1);
    else if (!isEdit) {
      setTypeChosen(false);
    } else {
      router.push("/products");
    }
  }

  // ─── Tags ───────────────────────────────────────────────────────────
  function addTag() {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) {
      setTags([...tags, t]);
    }
    setTagInput("");
  }

  function removeTag(tag: string) {
    setTags(tags.filter((t) => t !== tag));
  }

  function buildProductAttributesPayload() {
    return serializeProductAttributes(productAttributes);
  }

  // ─── Build payload ──────────────────────────────────────────────────
  function buildPayload(variantRows: ReturnType<typeof buildVariantRowsPayload>) {
    const payload: Record<string, unknown> = {
      name: name.trim(),
      category_id: categoryId,
      has_variants: hasVariants,
    };

    if (hasVariants) {
      // The product price of a variable product is the derived "from" price —
      // the backend re-derives it from variants, so only send it on create.
      if (!isEdit) payload.base_price = minVariantPriceFils(variantRows) ?? 0;
    } else {
      payload.base_price = Math.round(Number(basePrice) * 100);
      if (compareAtPrice) payload.compare_at_price = Math.round(Number(compareAtPrice) * 100);
      if (!isEdit) {
        Object.assign(
          payload,
          buildSimpleProductInventoryPayload({ hasVariants, quantityOnHand }),
        );
      }
    }

    if (description.trim()) payload.description = description.trim();
    if (brandId) payload.brand_id = brandId;
    if (sku.trim()) payload.sku = sku.trim();
    if (barcode.trim()) payload.barcode = barcode.trim();
    if (weight) payload.weight = Number(weight);
    if (tags.length > 0) payload.tags = tags;

    // SEO — always sent so an emptied field clears the stored value
    payload.meta_title = metaTitle.trim() || null;
    payload.meta_description = metaDescription.trim() || null;
    const keywords = metaKeywords
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
    payload.meta_keywords = keywords.length > 0 ? keywords : null;

    // New fields
    if (shortDescription.trim()) payload.short_description = shortDescription.trim();
    if (richDescription.trim()) payload.rich_description = richDescription.trim();
    if (ingredients.trim()) payload.ingredients = ingredients.trim();
    if (usageInstructions.trim()) payload.usage_instructions = usageInstructions.trim();
    if (costPrice) payload.cost_price = Math.round(Number(costPrice) * 100);
    if (dimensionL && dimensionW && dimensionH) {
      payload.dimensions_cm = {
        length: Number(dimensionL),
        width: Number(dimensionW),
        height: Number(dimensionH),
      };
    }
    if (countryOfOrigin.trim()) payload.country_of_origin = countryOfOrigin.trim();
    payload.is_digital = isDigital;
    payload.is_customizable = isCustomizable;
    payload.editorial = editorial;
    payload.attributes = buildProductAttributesPayload();
    const ar = buildArabicTranslationsPayload(arabic, hadStoredArabic);
    if (ar.translations) payload.translations = ar.translations;

    return payload;
  }

  // Stock on edit is managed per warehouse by <InventoryPanel />. The old
  // single-field delta summed every warehouse's row, then applied the whole
  // difference to whichever row the server happened to resolve — which is how a
  // reduction could exceed one warehouse's stock and trip NEGATIVE_STOCK.

  // ─── Submit ─────────────────────────────────────────────────────────
  async function handleSubmit(status: "draft" | "pending_review" = "draft") {
    for (let s = 0; s < STEPS.length; s++) {
      const errs = validateStep(s);
      if (Object.keys(errs).length > 0) {
        setErrors(errs);
        setStep(s);
        return;
      }
    }
    setErrors({});

    const missingAttrs = missingRequiredAttributes(productAttributes, descriptiveAttributes);
    if (missingAttrs.length > 0) {
      toast({
        title: "Missing required attributes",
        description: `Saving anyway — please set: ${missingAttrs.join(", ")}`,
        variant: "destructive",
      });
    }

    const arabicCheck = buildArabicTranslationsPayload(arabic, hadStoredArabic);
    if (arabicCheck.error) {
      toast({ title: "Arabic content", description: arabicCheck.error, variant: "destructive" });
      return;
    }

    const variantRows = hasVariants
      ? buildVariantRowsPayload(variantMatrix, existingVariantKeys(existingVariants))
      : [];
    const payload = buildPayload(variantRows);
    // On edit, "Save Changes" must not reset the review state; only an explicit
    // submit-for-review carries a status.
    if (!isEdit || status === "pending_review") payload.status = status;

    try {
      if (isEdit) {
        await updateProduct({ id: productId, payload });
        if (variantRows.length > 0) {
          try {
            await generateVariants({ productId, variants: variantRows });
          } catch {
            toast({
              title: "Warning",
              description: "Product updated but the new variants could not be created.",
              variant: "destructive",
            });
          }
        }
        toast({ title: "Product updated" });
        router.push("/products");
      } else {
        const result = await createProduct(payload);
        const newId = result?.id ?? result?.product?.id;

        if (newId && variantRows.length > 0) {
          try {
            await generateVariants({
              productId: newId,
              variants: variantRows,
            });
          } catch {
            toast({
              title: "Warning",
              description:
                "Product created but variant creation failed. You can add variants from the edit page.",
              variant: "destructive",
            });
          }
        }

        toast({ title: "Product created" });
        router.push("/products");
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? "Something went wrong. Try again.";
      toast({ title: "Error", description: msg, variant: "destructive" });
    }
  }

  // ─── Computed values ────────────────────────────────────────────────
  const selectedCategory = categoryItems.find((c) => c.id === categoryId);
  const selectedBrand = brandItems.find((b) => b.id === brandId);
  // The raw record, not the combobox item — the item's label already has the
  // status baked into it and carries no rejection reason.
  const selectedBrandRecord = brands.find((b) => b.id === brandId);
  const selectedBrandStatus = selectedBrandRecord?.status;
  const currentStepKey = forceStep ?? STEPS[step]?.key;

  const seoPreviewTitle = metaTitle || name || "Product Title";
  const seoPreviewDesc =
    metaDescription || description || "Product description will appear here...";
  const seoPreviewUrl = `materialhubuae.com/products/${
    name
      ? name
          .toLowerCase()
          .replace(/\s+/g, "-")
          .replace(/[^a-z0-9-]/g, "")
      : "product-slug"
  }`;

  // New variants the matrix will create (excludes combos that already exist)
  const variantCount = useMemo(
    () => buildVariantRowsPayload(variantMatrix, existingVariantKeys(existingVariants)).length,
    [variantMatrix, existingVariants],
  );

  /* ══════════════════════════════════════════════════════════════════════
     RENDER: Product Type Chooser
     ══════════════════════════════════════════════════════════════════════ */

  if (!typeChosen) {
    return (
      <div className="max-w-2xl mx-auto space-y-8 pb-10">
        {/* Decorative header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 via-orange-400 to-rose-400 shadow-lg shadow-amber-200/50">
            <Package size={28} className="text-white" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">What are you selling?</h2>
          <p className="text-gray-500 text-sm max-w-md mx-auto">
            Choose the product type that best fits your item. This determines which options you'll
            configure.
          </p>
        </div>

        {/* Type cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Simple Product */}
          <button
            type="button"
            onClick={() => {
              setHasVariants(false);
              setTypeChosen(true);
            }}
            className={`
              group relative text-left p-6 rounded-2xl border-2 transition-all duration-200
              hover:shadow-lg hover:shadow-amber-100/50 hover:-translate-y-0.5
              border-gray-200 hover:border-amber-300 bg-white
            `}
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-sky-50 to-sky-100 flex items-center justify-center border border-sky-200/60">
                  <Package size={22} className="text-sky-600" />
                </div>
                <ArrowRight
                  size={18}
                  className="text-gray-300 group-hover:text-amber-500 transition-colors"
                />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Simple Product</h3>
                <p className="text-sm text-gray-500 mt-1 leading-relaxed">
                  A single item with one price. No size, color, or style variations needed.
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {["Greyboard sheet", "Kraft roll", "Adhesive", "Craft kit"].map((ex) => (
                  <span
                    key={ex}
                    className="text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full bg-sky-50 text-sky-600 border border-sky-100"
                  >
                    {ex}
                  </span>
                ))}
              </div>
            </div>
          </button>

          {/* Variable Product */}
          <button
            type="button"
            onClick={() => {
              setHasVariants(true);
              setTypeChosen(true);
            }}
            className={`
              group relative text-left p-6 rounded-2xl border-2 transition-all duration-200
              hover:shadow-lg hover:shadow-amber-100/50 hover:-translate-y-0.5
              border-gray-200 hover:border-amber-300 bg-white
            `}
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-50 to-violet-100 flex items-center justify-center border border-violet-200/60">
                  <Stack size={22} className="text-violet-600" />
                </div>
                <ArrowRight
                  size={18}
                  className="text-gray-300 group-hover:text-amber-500 transition-colors"
                />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Variable Product</h3>
                <p className="text-sm text-gray-500 mt-1 leading-relaxed">
                  Comes in different options like size, color, or material. Each combination can
                  have its own price and stock.
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {["Paper by gsm", "Box by size", "Ribbon by colour", "Leather by finish"].map((ex) => (
                  <span
                    key={ex}
                    className="text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full bg-violet-50 text-violet-600 border border-violet-100"
                  >
                    {ex}
                  </span>
                ))}
              </div>
            </div>
          </button>
        </div>

        {/* Back link */}
        <div className="text-center">
          <button
            type="button"
            onClick={() => router.push("/products")}
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            <ArrowLeft size={14} className="inline mr-1" />
            Back to products
          </button>
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════════════════
     RENDER: Main Form
     ══════════════════════════════════════════════════════════════════════ */

  return (
    <div className="max-w-3xl space-y-6 pb-10">
      {/* ── Product type badge ─────────────────────────────────────────── */}
      {!forceStep && (
        <div className="flex items-center gap-3">
          <div
            className={`
            inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider
            ${
              hasVariants
                ? "bg-violet-50 text-violet-700 border border-violet-200"
                : "bg-sky-50 text-sky-700 border border-sky-200"
            }
          `}
          >
            {hasVariants ? <Stack size={12} /> : <Package size={12} />}
            {hasVariants ? "Variable Product" : "Simple Product"}
          </div>
          {!isEdit && (
            <button
              type="button"
              onClick={() => {
                setTypeChosen(false);
                setStep(0);
              }}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors underline underline-offset-2"
            >
              Change
            </button>
          )}
        </div>
      )}

      {/* ── Step indicator ────────────────────────────────────────────── */}
      {!forceStep && (
        <div className="flex items-center gap-1">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const isActive = i === step;
            const isDone = i < step;

            return (
              <div key={s.key} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    if (i !== step) {
                      setStep(i);
                      setErrors({});
                    }
                  }}
                  className={`
                  flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer
                  ${
                    isActive
                      ? "bg-amber-50 text-amber-800 border border-amber-200 shadow-sm"
                      : isDone
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                        : "bg-gray-50 text-gray-500 border border-gray-100 hover:bg-gray-100 hover:text-gray-700"
                  }
                `}
                >
                  <span
                    className={`
                  flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold
                  ${
                    isActive
                      ? "bg-amber-500 text-white"
                      : isDone
                        ? "bg-emerald-500 text-white"
                        : "bg-gray-200 text-gray-400"
                  }
                `}
                  >
                    {isDone ? <Check size={12} /> : i + 1}
                  </span>
                  <span className="hidden sm:inline">{s.label}</span>
                </button>
                {i < STEPS.length - 1 && (
                  <div className={`w-6 h-px ${isDone ? "bg-emerald-300" : "bg-gray-200"}`} />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Error banner ──────────────────────────────────────────────── */}
      {Object.keys(errors).length > 0 && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 flex items-start gap-2">
          <WarningCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
          <div className="text-sm text-red-700">
            {Object.values(errors).map((e, i) => (
              <p key={i}>{e}</p>
            ))}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
         Step: Product Details
         ══════════════════════════════════════════════════════════════════ */}
      {currentStepKey === "details" && (
        <div className="space-y-5">
          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Basic Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-sm font-medium text-gray-700">
                  Product Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Greyboard 2 mm, 70 × 100 cm"
                  className={`mt-1 ${errors.name ? "border-red-300 focus-visible:ring-red-200" : ""}`}
                />
              </div>

              <div>
                <Label className="text-sm font-medium text-gray-700">Description</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe your product — materials, features, care instructions…"
                  rows={4}
                  className="mt-1"
                />
              </div>

              <div>
                <Label className="text-sm font-medium text-gray-700">Short Description</Label>
                <Input
                  value={shortDescription}
                  onChange={(e) => setShortDescription(e.target.value)}
                  placeholder="One-line tagline shown in listing"
                  className="mt-1"
                />
              </div>

              <div>
                <Label className="text-sm font-medium text-gray-700">Rich Description</Label>
                <Textarea
                  value={richDescription}
                  onChange={(e) => setRichDescription(e.target.value)}
                  placeholder="Long-form description with marketing copy"
                  rows={5}
                  className="mt-1"
                />
              </div>

              <div>
                <Label className="text-sm font-medium text-gray-700">Material composition</Label>
                <Textarea
                  value={ingredients}
                  onChange={(e) => setIngredients(e.target.value)}
                  placeholder="e.g. 100% recycled board, water-based coating"
                  rows={3}
                  className="mt-1"
                />
              </div>

              <div>
                <Label className="text-sm font-medium text-gray-700">Handling and use</Label>
                <Textarea
                  value={usageInstructions}
                  onChange={(e) => setUsageInstructions(e.target.value)}
                  placeholder="e.g. Store flat and dry; score before folding"
                  rows={3}
                  className="mt-1"
                />
              </div>

              <fieldset className="space-y-3 rounded-lg border border-gray-200 p-3" dir="rtl" lang="ar">
                <legend className="px-1 text-sm font-medium text-gray-700" dir="ltr">
                  Arabic (العربية) — optional
                </legend>
                <div>
                  <Label htmlFor="ar-name" className="text-sm font-medium text-gray-700">
                    اسم المنتج
                  </Label>
                  <Input
                    id="ar-name"
                    value={arabic.name}
                    onChange={(e) => setArabic((a) => ({ ...a, name: e.target.value }))}
                    placeholder="مثال: كرتون رمادي 2 مم، 70 × 100 سم"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="ar-short" className="text-sm font-medium text-gray-700">
                    وصف مختصر
                  </Label>
                  <Input
                    id="ar-short"
                    value={arabic.short_description}
                    onChange={(e) =>
                      setArabic((a) => ({ ...a, short_description: e.target.value }))
                    }
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="ar-desc" className="text-sm font-medium text-gray-700">
                    الوصف
                  </Label>
                  <Textarea
                    id="ar-desc"
                    value={arabic.description}
                    onChange={(e) => setArabic((a) => ({ ...a, description: e.target.value }))}
                    rows={4}
                    className="mt-1"
                  />
                </div>
                <p className="text-xs text-gray-500" dir="ltr">
                  Shown on the Arabic storefront. Leave blank to show the English text.
                </p>
              </fieldset>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium text-gray-700">
                    Category <span className="text-red-500">*</span>
                  </Label>
                  <div
                    className={`mt-1 ${errors.category_id ? "[&>div>button]:border-red-300" : ""}`}
                  >
                    <EntityCombobox
                      value={categoryId || null}
                      onChange={(id) => setCategoryId(id ?? "")}
                      search={searchCategories}
                      getById={getCategoryById}
                      placeholder="Search categories…"
                      emptyMessage="No matching categories"
                      disabled={loadingRefs}
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-700">Brand</Label>
                  <div className="mt-1">
                    <EntityCombobox
                      value={brandId || null}
                      onChange={(id) => setBrandId(id ?? "")}
                      search={searchBrands}
                      getById={getBrandById}
                      placeholder="Search brands…"
                      emptyMessage="No matching brands"
                      disabled={loadingRefs}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setRequestingBrand(true)}
                    className="mt-1.5 text-xs text-gray-500 underline hover:text-gray-700"
                  >
                    Can't find your brand? Request it
                  </button>
                  {selectedBrandStatus === "pending" && (
                    <p className="mt-1.5 text-xs text-amber-700">
                      Awaiting admin review. You can publish against it now; it stays hidden on
                      the storefront until approved.
                    </p>
                  )}
                  {selectedBrandStatus === "rejected" && (
                    <p className="mt-1.5 text-xs text-red-600">
                      This brand was rejected
                      {selectedBrandRecord?.rejection_reason
                        ? `: ${selectedBrandRecord.rejection_reason}`
                        : "."}{" "}
                      Pick another brand before publishing.
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {descriptiveAttributes.length > 0 && (
            <ProductAttributesEditor
              categoryAttributes={descriptiveAttributes}
              value={productAttributes}
              onChange={setProductAttributes}
              editing
            />
          )}

          {/* Tags */}
          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Tag size={16} />
                Tags
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                  placeholder="Type a tag and press Enter…"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addTag}
                  className="shrink-0"
                >
                  <Plus size={14} className="mr-1" />
                  Add
                </Button>
              </div>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {tags.map((tag) => (
                    <Badge
                      key={tag}
                      variant="secondary"
                      className="gap-1 pl-2.5 pr-1.5 py-1 text-xs bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => removeTag(tag)}
                        className="ml-0.5 hover:text-red-600 transition-colors"
                      >
                        <X size={12} />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
         Step: Pricing & Specs
         ══════════════════════════════════════════════════════════════════ */}
      {currentStepKey === "pricing" && (
        <div className="space-y-5">
          {hasVariants ? (
            <Card className="border-violet-200 bg-violet-50/30 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-violet-900">Pricing</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-violet-700">
                  Each variant has its own price — set them in the Variants step. The product's
                  listed "from" price is derived automatically from the cheapest variant.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-gray-200 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Pricing</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <Label className="text-sm font-medium text-gray-700">
                      Base Price (AED) <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      value={basePrice}
                      onChange={(e) => setBasePrice(e.target.value)}
                      placeholder="0.00"
                      className={`mt-1 ${errors.base_price ? "border-red-300" : ""}`}
                    />
                    <p className="text-xs text-gray-400 mt-1">Stored in fils (smallest unit)</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-700">
                      Compare-at Price (AED)
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      value={compareAtPrice}
                      onChange={(e) => setCompareAtPrice(e.target.value)}
                      placeholder="0.00"
                      className="mt-1"
                    />
                    <p className="text-xs text-gray-400 mt-1">Original price shown crossed out</p>
                  </div>
                  {/* Opening stock only. Once the product exists its stock lives
                      in per-warehouse inventory rows, edited on the Inventory
                      tab — a single field here would have to sum them, and any
                      change would land on whichever row the server resolved. */}
                  {!isEdit && (
                    <div>
                      <Label className="text-sm font-medium text-gray-700">Quantity on Hand</Label>
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        value={quantityOnHand}
                        onChange={(e) => setQuantityOnHand(e.target.value)}
                        placeholder="0"
                        className={`mt-1 ${errors.quantity_on_hand ? "border-red-300" : ""}`}
                      />
                      <p className="text-xs text-gray-400 mt-1">Opening stock for this product</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Identification & Shipping</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <Label className="text-sm font-medium text-gray-700">SKU</Label>
                  <Input
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    placeholder="SKU-001"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-700">Barcode</Label>
                  <Input
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    placeholder="EAN / UPC"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-700">Weight (grams)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    placeholder="0"
                    className="mt-1"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Cost & Margin</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-sm font-medium text-gray-700">Cost Price (AED)</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={costPrice}
                  onChange={(e) => setCostPrice(e.target.value)}
                  placeholder="0.00"
                  className="mt-1"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Your unit cost — used for margin reporting
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Dimensions & Origin</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <Label className="text-sm font-medium text-gray-700">Length (cm)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={dimensionL}
                    onChange={(e) => setDimensionL(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-700">Width (cm)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={dimensionW}
                    onChange={(e) => setDimensionW(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-700">Height (cm)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={dimensionH}
                    onChange={(e) => setDimensionH(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>
              <div>
                <Label className="text-sm font-medium text-gray-700">Country of Origin</Label>
                <Input
                  value={countryOfOrigin}
                  onChange={(e) => setCountryOfOrigin(e.target.value.toUpperCase())}
                  placeholder="AE"
                  maxLength={2}
                  className="mt-1"
                />
                <p className="text-xs text-gray-400 mt-1">ISO 2-letter country code</p>
              </div>
              <div className="flex gap-6">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={isDigital}
                    onChange={(e) => setIsDigital(e.target.checked)}
                    className="rounded"
                  />
                  Digital product (no shipping)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={isCustomizable}
                    onChange={(e) => setIsCustomizable(e.target.checked)}
                    className="rounded"
                  />
                  Customizable
                </label>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
         Step: Variants (only for variable products)
         ══════════════════════════════════════════════════════════════════ */}
      {currentStepKey === "variants" && (
        <div className="space-y-5">
          {/* Existing variants (edit mode) */}
          {existingVariants.length > 0 && (
            <Card className="border-violet-200 bg-violet-50/30 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-violet-900 flex items-center gap-2">
                  <Stack size={16} />
                  Current Variants
                  <Badge
                    variant="secondary"
                    className="bg-violet-100 text-violet-700 border-violet-200 text-xs"
                  >
                    {existingVariants.length}
                  </Badge>
                </CardTitle>
                <p className="text-xs text-violet-600 mt-1">
                  These variants already exist. You can manage them from the product detail page.
                </p>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {existingVariants.map((v) => (
                    <div
                      key={v.id}
                      className="flex items-center justify-between px-3 py-2 rounded-lg bg-white border border-violet-100"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-2 h-2 rounded-full ${v.is_active !== false ? "bg-emerald-500" : "bg-gray-300"}`}
                        />
                        <span className="text-sm font-medium text-gray-900">{v.name}</span>
                        {v.sku && <span className="text-xs text-gray-400 font-mono">{v.sku}</span>}
                      </div>
                      {v.price != null && (
                        <span className="text-sm font-semibold text-gray-700">
                          AED {(v.price / 100).toFixed(2)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Variant matrix — axes from the category's variant attributes + custom options */}
          {errors.variants && (
            <p className="text-sm text-red-600 flex items-center gap-1.5">
              <WarningCircle size={14} />
              {errors.variants}
            </p>
          )}
          <VariantMatrixEditor
            variantAttributes={variantAxes}
            value={variantMatrix}
            onChange={setVariantMatrix}
            existingVariants={existingVariants}
          />
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
         Step: Media
         ══════════════════════════════════════════════════════════════════ */}
      {currentStepKey === "media" && (
        <VendorMediaTab
          productId={productId ?? ""}
          variants={existingVariants.map((v) => ({ id: v.id, name: v.name }))}
          embedded
        />
      )}

      {/* ══════════════════════════════════════════════════════════════════
         Step: Editorial
         ══════════════════════════════════════════════════════════════════ */}
      {currentStepKey === "editorial" && (
        <div className="space-y-5">
          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Editorial — "From the brand"</CardTitle>
              <p className="text-xs text-gray-400 mt-1">
                Optional editorial content shown on the PDP. Enable only the sections you want to
                ship.
              </p>
            </CardHeader>
            <CardContent>
              <EditorialEditor
                value={editorial}
                onChange={setEditorial}
                uploadClient={s3UploadClient}
              />
            </CardContent>
          </Card>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
         Step: SEO
         ══════════════════════════════════════════════════════════════════ */}
      {currentStepKey === "seo" && (
        <div className="space-y-5">
          {/* Google preview card */}
          <Card className="border-gray-200 shadow-sm overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <MagnifyingGlass size={16} className="text-gray-400" />
                Search Engine Preview
              </CardTitle>
              <p className="text-xs text-gray-400">
                This is how your product may appear in Google search results.
              </p>
            </CardHeader>
            <CardContent>
              <div className="rounded-xl bg-white border border-gray-100 p-4 space-y-1">
                <p className="text-xs text-emerald-700 truncate font-mono">{seoPreviewUrl}</p>
                <h3 className="text-lg text-blue-800 font-medium leading-tight truncate hover:underline cursor-pointer">
                  {seoPreviewTitle}
                </h3>
                <p className="text-sm text-gray-600 line-clamp-2 leading-relaxed">
                  {seoPreviewDesc.slice(0, 160)}
                  {seoPreviewDesc.length > 160 ? "…" : ""}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* SEO fields */}
          <Card className="border-gray-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Globe size={16} />
                Meta Tags
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-sm font-medium text-gray-700">Meta Title</Label>
                <Input
                  value={metaTitle}
                  onChange={(e) => setMetaTitle(e.target.value)}
                  placeholder={name || "Product title for search engines"}
                  className="mt-1"
                />
                <div className="flex justify-between mt-1">
                  <p className="text-xs text-gray-400">Defaults to product name if empty</p>
                  <span
                    className={`text-xs font-mono ${
                      (metaTitle || name).length > 60 ? "text-red-500" : "text-gray-400"
                    }`}
                  >
                    {(metaTitle || name).length}/60
                  </span>
                </div>
              </div>

              <div>
                <Label className="text-sm font-medium text-gray-700">Meta Description</Label>
                <Textarea
                  value={metaDescription}
                  onChange={(e) => setMetaDescription(e.target.value)}
                  placeholder="Concise description for search results (150–160 characters recommended)"
                  rows={3}
                  className="mt-1"
                />
                <div className="flex justify-between mt-1">
                  <p className="text-xs text-gray-400">Shown below the title in search results</p>
                  <span
                    className={`text-xs font-mono ${
                      metaDescription.length > 160
                        ? "text-red-500"
                        : metaDescription.length > 120
                          ? "text-amber-500"
                          : "text-gray-400"
                    }`}
                  >
                    {metaDescription.length}/160
                  </span>
                </div>
              </div>

              <div>
                <Label className="text-sm font-medium text-gray-700">Meta Keywords</Label>
                <Input
                  value={metaKeywords}
                  onChange={(e) => setMetaKeywords(e.target.value)}
                  placeholder="keyword1, keyword2, keyword3"
                  className="mt-1"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Comma-separated keywords for search indexing
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Review summary */}
          <Card className="border-amber-200 bg-amber-50/30 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-amber-900">Review Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                <div className="text-gray-500">Name</div>
                <div className="font-medium text-gray-900">{name || "—"}</div>

                <div className="text-gray-500">Type</div>
                <div className="font-medium text-gray-900">
                  {hasVariants ? "Variable" : "Simple"}
                </div>

                <div className="text-gray-500">Category</div>
                <div className="font-medium text-gray-900">{selectedCategory?.label || "—"}</div>

                <div className="text-gray-500">Brand</div>
                <div className="font-medium text-gray-900">{selectedBrand?.label || "—"}</div>

                <div className="text-gray-500">Price</div>
                <div className="font-medium text-gray-900">
                  {hasVariants
                    ? (() => {
                        const min = minVariantPriceFils(
                          buildVariantRowsPayload(
                            variantMatrix,
                            existingVariantKeys(existingVariants),
                          ),
                        );
                        return min != null ? `from AED ${(min / 100).toFixed(2)}` : "per variant";
                      })()
                    : basePrice
                      ? `AED ${Number(basePrice).toFixed(2)}`
                      : "—"}
                  {!hasVariants && compareAtPrice && (
                    <span className="text-gray-400 line-through ml-2 text-xs">
                      AED {Number(compareAtPrice).toFixed(2)}
                    </span>
                  )}
                </div>

                <div className="text-gray-500">SKU</div>
                <div className="font-medium text-gray-900">{sku || "—"}</div>

                {hasVariants && (
                  <>
                    <div className="text-gray-500">Variants</div>
                    <div className="font-medium text-gray-900">
                      {existingVariants.length > 0
                        ? `${existingVariants.length} existing`
                        : variantCount > 0
                          ? `${variantCount} to generate`
                          : "None configured"}
                    </div>
                  </>
                )}

                <div className="text-gray-500">Tags</div>
                <div className="font-medium text-gray-900">
                  {tags.length > 0 ? tags.join(", ") : "—"}
                </div>

                <div className="text-gray-500">Meta Title</div>
                <div className="font-medium text-gray-900 truncate">{metaTitle || name || "—"}</div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Navigation ────────────────────────────────────────────────── */}
      {forceStep ? (
        <div className="flex items-center justify-end pt-2 gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => handleSubmit("draft")}
          >
            {isPending ? <Spinner size={16} className="mr-1.5 animate-spin" /> : null}
            Save Changes
          </Button>
          <Button
            type="button"
            disabled={isPending}
            onClick={() => handleSubmit("pending_review")}
            className="bg-amber-600 hover:bg-amber-700 text-espresso"
          >
            {isPending ? (
              <Spinner size={16} className="mr-1.5 animate-spin" />
            ) : (
              <Check size={16} className="mr-1.5" />
            )}
            Update Product
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-between pt-2">
          <Button type="button" variant="outline" onClick={handleBack}>
            <ArrowLeft size={16} className="mr-1.5" />
            {step > 0 ? "Back" : isEdit ? "Cancel" : "Change Type"}
          </Button>

          <div className="flex gap-2">
            {step < STEPS.length - 1 ? (
              <Button type="button" onClick={handleNext}>
                Next
                <ArrowRight size={16} className="ml-1.5" />
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isPending || generatingVariants}
                  onClick={() => handleSubmit("draft")}
                >
                  {isPending ? <Spinner size={16} className="mr-1.5 animate-spin" /> : null}
                  {isEdit ? "Save Changes" : "Save as Draft"}
                </Button>
                <Button
                  type="button"
                  disabled={isPending || generatingVariants}
                  onClick={() => handleSubmit("pending_review")}
                  className="bg-amber-600 hover:bg-amber-700 text-espresso"
                >
                  {isPending || generatingVariants ? (
                    <Spinner size={16} className="mr-1.5 animate-spin" />
                  ) : (
                    <Check size={16} className="mr-1.5" />
                  )}
                  {isEdit ? "Update Product" : "Submit for Review"}
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {requestingBrand && (
        <RequestBrandModal
          onClose={() => setRequestingBrand(false)}
          onCreated={(brand) => {
            // Submitting an existing name returns that brand rather than a
            // duplicate, so guard against adding it to the list twice.
            setBrands((prev) =>
              prev.some((b) => b.id === brand.id) ? prev : [...prev, brand as Brand],
            );
            setBrandId(brand.id);
            setRequestingBrand(false);
          }}
        />
      )}
    </div>
  );
}

