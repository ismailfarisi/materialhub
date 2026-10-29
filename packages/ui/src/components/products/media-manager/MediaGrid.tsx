"use client";

import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ComponentProps } from "react";
import { MediaTile } from "./MediaTile";
import type { Capability, MediaItem } from "./types";

interface GridProps {
  items: MediaItem[];
  selected: Set<string>;
  caps: Partial<Record<Capability, boolean>>;
  variants?: { id: string; name: string }[];
  onReorder: (ids: string[]) => void;
  onSelect: (id: string, evt: React.MouseEvent) => void;
  onActions: (id: string) => {
    expand: () => void;
    crop: () => void;
    replace: () => void;
    enhance: () => void;
    delete: () => void;
    saveAlt: (txt: string) => void;
    revertAi: () => void;
  };
}

function SortableTile({
  item,
  ...rest
}: { item: MediaItem } & Omit<ComponentProps<typeof MediaTile>, "item">) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <MediaTile item={item} {...rest} />
    </div>
  );
}

export function MediaGrid({
  items,
  selected,
  caps,
  variants,
  onReorder,
  onSelect,
  onActions,
}: GridProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const ids = items.map((i) => i.id);
    const from = ids.indexOf(String(e.active.id));
    const to = ids.indexOf(String(e.over.id));
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(ids, from, to));
  };

  const variantNameById = new Map((variants ?? []).map((v) => [v.id, v.name]));

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={items.map((i) => i.id)} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 pb-8">
          {items.map((item) => (
            <SortableTile
              key={item.id}
              item={item}
              selected={selected.has(item.id)}
              caps={caps}
              variantLabel={item.variant_id ? variantNameById.get(item.variant_id) : undefined}
              on={{
                select: (e) => onSelect(item.id, e),
                ...onActions(item.id),
              }}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
