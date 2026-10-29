"use client";

import { useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button, Card, CardContent, CardHeader, CardTitle, toast } from "@materialhub/ui";
import { GripVertical, Loader2, Trash2, X } from "lucide-react";
import { EntityCombobox } from "@/components/ui/entity-combobox";
import {
  searchAdminProductsLookup,
  getAdminProductByIdLookup,
} from "@/lib/queries/lookups";
import {
  useAddItems,
  useCollectionItems,
  useRemoveItem,
  useReorderItems,
  useResolveSkus,
  type CollectionItem,
  type SkuResolution,
} from "@/lib/queries/collections";

interface ItemsEditorProps {
  collectionId: string;
  role: "pin" | "exclude";
  title: string;
}

function Row({
  item,
  onRemove,
  sortable,
}: {
  item: CollectionItem;
  onRemove: () => void;
  sortable: boolean;
}) {
  const s = useSortable({ id: item.item_id, disabled: !sortable });
  const style = {
    transform: CSS.Transform.toString(s.transform),
    transition: s.transition,
    opacity: s.isDragging ? 0.5 : 1,
  };
  return (
    <div
      ref={s.setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-md border bg-background px-2 py-1.5"
    >
      {sortable && (
        <button {...s.attributes} {...s.listeners} className="cursor-grab text-muted-foreground">
          <GripVertical size={16} />
        </button>
      )}
      {item.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.image_url} alt="" className="h-8 w-8 rounded object-cover" />
      ) : (
        <div className="h-8 w-8 rounded bg-muted" />
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm">{item.name}</div>
        {item.sku && <div className="truncate text-xs text-muted-foreground">{item.sku}</div>}
      </div>
      <button type="button" onClick={onRemove} className="text-muted-foreground hover:text-red-600">
        <Trash2 size={15} />
      </button>
    </div>
  );
}

export function ItemsEditor({ collectionId, role, title }: ItemsEditorProps) {
  const { data: items = [], isLoading } = useCollectionItems(collectionId, role);
  const addItems = useAddItems(collectionId);
  const removeItem = useRemoveItem(collectionId);
  const reorder = useReorderItems(collectionId);
  const resolveSkus = useResolveSkus();

  const [pasted, setPasted] = useState("");
  const [resolution, setResolution] = useState<SkuResolution | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const sortable = role === "pin";

  function handleResolve() {
    const skus = pasted
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (skus.length === 0) return;
    setResolution(null);
    resolveSkus.mutate(
      { kind: "product", skus },
      {
        onSuccess: (res) => setResolution(res),
        onError: (err: any) =>
          toast({
            title: "Resolve failed",
            description: err?.response?.data?.message ?? "Could not resolve SKUs.",
            variant: "destructive",
          }),
      },
    );
  }

  function handleAddResolved() {
    if (!resolution || resolution.matched.length === 0) return;
    const entries = resolution.matched.map((m) => ({ product_id: m.id, source_sku: m.sku }));
    addItems.mutate(
      { role, entries },
      {
        onSuccess: () => {
          toast({ title: "Added", description: `${entries.length} product(s) added.` });
          setResolution(null);
          setPasted("");
        },
        onError: (err: any) =>
          toast({
            title: "Add failed",
            description: err?.response?.data?.message ?? "Could not add items.",
            variant: "destructive",
          }),
      },
    );
  }

  function handleAddOne(productId: string | null) {
    if (!productId) return;
    addItems.mutate(
      { role, entries: [{ product_id: productId }] },
      {
        onSuccess: () => toast({ title: "Added", description: "Product added." }),
        onError: (err: any) =>
          toast({
            title: "Add failed",
            description: err?.response?.data?.message ?? "Could not add item.",
            variant: "destructive",
          }),
      },
    );
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.item_id === active.id);
    const newIndex = items.findIndex((i) => i.item_id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const next = arrayMove(items, oldIndex, newIndex);
    reorder.mutate(next.map((i) => i.item_id));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold text-cacao uppercase tracking-wide">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-cacao mb-1">Add by search</label>
          <EntityCombobox
            value={null}
            onChange={handleAddOne}
            search={searchAdminProductsLookup}
            getById={getAdminProductByIdLookup}
            placeholder="Search products by name or SKU…"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-cacao mb-1">Bulk paste SKUs</label>
          <textarea
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            rows={3}
            placeholder="One SKU per line (or comma-separated)…"
            className="w-full rounded-md border border-gray-300 bg-linen px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <div className="mt-2 flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleResolve}
              disabled={resolveSkus.isPending || !pasted.trim()}
            >
              {resolveSkus.isPending && <Loader2 size={14} className="mr-1.5 animate-spin" />}
              Resolve
            </Button>
          </div>
          {resolution && (
            <div className="mt-2 rounded-md border bg-pearl/30 p-3 text-sm space-y-2">
              <div>
                Matched: <strong>{resolution.matched.length}</strong>
                {resolution.unmatched.length > 0 && (
                  <span className="ml-3 text-red-600">
                    Unmatched: {resolution.unmatched.join(", ")}
                  </span>
                )}
                {resolution.duplicates.length > 0 && (
                  <span className="ml-3 text-amber-600">
                    Duplicates: {resolution.duplicates.join(", ")}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={handleAddResolved}
                  disabled={resolution.matched.length === 0 || addItems.isPending}
                >
                  {addItems.isPending && <Loader2 size={14} className="mr-1.5 animate-spin" />}
                  Add {resolution.matched.length} matched
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setResolution(null)}>
                  <X size={14} className="mr-1" />
                  Dismiss
                </Button>
              </div>
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-cacao mb-1">
            {items.length} item(s){sortable ? " — drag to reorder" : ""}
          </label>
          {isLoading ? (
            <div className="text-sm text-muted-foreground py-3">Loading…</div>
          ) : items.length === 0 ? (
            <div className="text-sm text-muted-foreground py-3">None yet.</div>
          ) : sortable ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={items.map((i) => i.item_id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-1.5">
                  {items.map((item) => (
                    <Row
                      key={item.item_id}
                      item={item}
                      sortable
                      onRemove={() => removeItem.mutate(item.item_id)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            <div className="space-y-1.5">
              {items.map((item) => (
                <Row
                  key={item.item_id}
                  item={item}
                  sortable={false}
                  onRemove={() => removeItem.mutate(item.item_id)}
                />
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
