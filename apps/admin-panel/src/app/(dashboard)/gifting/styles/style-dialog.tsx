"use client";

import { parseAedInput } from "@/lib/money";
import {
  type GiftStyle,
  type GiftStyleInput,
  useCreateGiftStyle,
  useUpdateGiftStyle,
} from "@/lib/queries/gifting";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Switch,
  toast,
} from "@materialhub/ui";
import { useEffect, useState } from "react";

const DIMENSION_UNITS = ["cm", "mm", "in"];

/** Convert fils to an editable AED string ("" for 0 keeps the placeholder visible). */
function filsToAedInput(fils: number | null | undefined): string {
  if (!fils) return "";
  return (fils / 100).toFixed(2);
}

export function StyleDialog({
  open,
  onOpenChange,
  style,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When provided, the dialog edits this style; otherwise it creates a new one. */
  style?: GiftStyle | null;
}) {
  const isEdit = !!style;
  const create = useCreateGiftStyle();
  const update = useUpdateGiftStyle();
  const isPending = create.isPending || update.isPending;

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [unit, setUnit] = useState("cm");
  const [maxCapacity, setMaxCapacity] = useState("");
  const [basePriceAed, setBasePriceAed] = useState("");
  // Images entered as one URL per line.
  const [imagesText, setImagesText] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState("");

  // Reset form whenever the dialog opens (for either create or edit).
  useEffect(() => {
    if (!open) return;
    setError("");
    setName(style?.name ?? "");
    setSlug(style?.slug ?? "");
    setDescription(style?.description ?? "");
    setLength(style?.dimensions ? String(style.dimensions.length) : "");
    setWidth(style?.dimensions ? String(style.dimensions.width) : "");
    setHeight(style?.dimensions ? String(style.dimensions.height) : "");
    setUnit(style?.dimensions?.unit ?? "cm");
    setMaxCapacity(style?.max_capacity != null ? String(style.max_capacity) : "");
    setBasePriceAed(filsToAedInput(style?.base_price));
    setImagesText((style?.images ?? []).join("\n"));
    setIsActive(style?.is_active ?? true);
  }, [open, style]);

  function onSubmit() {
    setError("");
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }

    // Dimensions: only send an object if all three numeric values are present.
    let dimensions: GiftStyleInput["dimensions"] = null;
    const hasAnyDim = length.trim() || width.trim() || height.trim();
    if (hasAnyDim) {
      const l = Number(length);
      const w = Number(width);
      const h = Number(height);
      if (![l, w, h].every((n) => Number.isFinite(n) && n > 0)) {
        setError("Dimensions must all be positive numbers (length, width, height).");
        return;
      }
      dimensions = { length: l, width: w, height: h, unit };
    }

    let maxCap: number | null = null;
    if (maxCapacity.trim()) {
      const c = Number(maxCapacity);
      if (!Number.isInteger(c) || c < 0) {
        setError("Max capacity must be a non-negative whole number.");
        return;
      }
      maxCap = c;
    }

    // Admin enters AED; store fils. Empty input → 0 fils.
    let basePriceFils = 0;
    if (basePriceAed.trim()) {
      const parsed = parseAedInput(basePriceAed);
      if (parsed === null) {
        setError("Base price must be a valid non-negative amount in AED.");
        return;
      }
      basePriceFils = parsed;
    }

    const images = imagesText
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);

    const body: GiftStyleInput = {
      name: name.trim(),
      slug: slug.trim() || undefined,
      description: description.trim() || null,
      dimensions,
      max_capacity: maxCap,
      base_price: basePriceFils,
      images,
      is_active: isActive,
    };

    const onError = (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Failed to save box style.";
      setError(msg);
      toast({ title: "Error", description: msg, variant: "destructive" });
    };

    if (isEdit && style) {
      update.mutate(
        { id: style.id, ...body },
        {
          onSuccess: () => {
            toast({ title: "Box style updated" });
            onOpenChange(false);
          },
          onError,
        },
      );
    } else {
      create.mutate(body, {
        onSuccess: () => {
          toast({ title: "Box style created" });
          onOpenChange(false);
        },
        onError,
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Box Style" : "New Box Style"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-cacao mb-1">Name *</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Luxury Black Box"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-cacao mb-1">Slug</label>
            <Input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="auto-generated from name"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-cacao mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-gray-300 bg-linen px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-cacao mb-1">Dimensions</label>
            <div className="grid grid-cols-4 gap-2">
              <Input
                type="number"
                value={length}
                onChange={(e) => setLength(e.target.value)}
                placeholder="L"
                aria-label="Length"
              />
              <Input
                type="number"
                value={width}
                onChange={(e) => setWidth(e.target.value)}
                placeholder="W"
                aria-label="Width"
              />
              <Input
                type="number"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                placeholder="H"
                aria-label="Height"
              />
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                aria-label="Unit"
                className="w-full rounded-md border border-gray-300 bg-background px-3 py-2 text-sm"
              >
                {DIMENSION_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-cacao mb-1">Max capacity</label>
              <Input
                type="number"
                value={maxCapacity}
                onChange={(e) => setMaxCapacity(e.target.value)}
                placeholder="e.g. 6"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-cacao mb-1">
                Base price (AED)
              </label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={basePriceAed}
                onChange={(e) => setBasePriceAed(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-cacao mb-1">
              Image URLs (one per line)
            </label>
            <textarea
              value={imagesText}
              onChange={(e) => setImagesText(e.target.value)}
              rows={3}
              placeholder={"https://…/box-front.jpg\nhttps://…/box-open.jpg"}
              className="w-full rounded-md border border-gray-300 bg-linen px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-cacao">Active</span>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={isPending}>
            {isPending ? "Saving…" : isEdit ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
