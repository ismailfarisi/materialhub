"use client";

import {
  type GiftOccasion,
  useCreateGiftOccasion,
  useUpdateGiftOccasion,
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

export function OccasionDialog({
  open,
  onOpenChange,
  occasion,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When provided, the dialog edits this occasion; otherwise it creates a new one. */
  occasion?: GiftOccasion | null;
}) {
  const isEdit = !!occasion;
  const create = useCreateGiftOccasion();
  const update = useUpdateGiftOccasion();
  const isPending = create.isPending || update.isPending;

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState("");

  // Reset form whenever the dialog opens (for either create or edit).
  useEffect(() => {
    if (!open) return;
    setError("");
    setName(occasion?.name ?? "");
    setSlug(occasion?.slug ?? "");
    setImageUrl(occasion?.image_url ?? "");
    setSortOrder(String(occasion?.sort_order ?? 0));
    setIsActive(occasion?.is_active ?? true);
  }, [open, occasion]);

  function onSubmit() {
    setError("");
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    const parsedSort = Number(sortOrder);
    if (!Number.isFinite(parsedSort)) {
      setError("Sort order must be a number.");
      return;
    }

    const body = {
      name: name.trim(),
      slug: slug.trim() || undefined,
      image_url: imageUrl.trim() || null,
      sort_order: Math.trunc(parsedSort),
      is_active: isActive,
    };

    const onError = (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Failed to save occasion.";
      setError(msg);
      toast({ title: "Error", description: msg, variant: "destructive" });
    };

    if (isEdit && occasion) {
      update.mutate(
        { id: occasion.id, ...body },
        {
          onSuccess: () => {
            toast({ title: "Occasion updated" });
            onOpenChange(false);
          },
          onError,
        },
      );
    } else {
      create.mutate(body, {
        onSuccess: () => {
          toast({ title: "Occasion created" });
          onOpenChange(false);
        },
        onError,
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Occasion" : "New Occasion"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-cacao mb-1">Name *</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Birthday"
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
            <label className="block text-sm font-medium text-cacao mb-1">Image URL</label>
            <Input
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://…"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-cacao mb-1">Sort order</label>
            <Input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
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
