"use client";

import { EntityMultiCombobox } from "@/components/ui/entity-combobox";
import { useAttributes } from "@/lib/queries/attributes";
import {
	type Category,
	useAdminCategoryTree,
	useAssignAttributes,
	useCategoryAttributes,
	useDeleteCategory,
	useReorderCategories,
	useToggleCategoryActive,
} from "@/lib/queries/categories";
import {
	getAdminAttributeByIdLookup,
	searchAdminAttributesLookup,
} from "@/lib/queries/lookups";
import {
	DndContext,
	type DragEndEvent,
	PointerSensor,
	closestCenter,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	SortableContext,
	arrayMove,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
	Button,
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Skeleton,
} from "@materialhub/ui";
import {
	ChevronDown,
	ChevronRight,
	Eye,
	EyeOff,
	GripVertical,
	Pencil,
	Plus,
	Tag,
	Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { CategoryFormDialog } from "./category-form-dialog";

function getSiblings(tree: Category[], parentId: string | null): Category[] {
	if (parentId === null) return tree;
	for (const node of tree) {
		if (node.id === parentId) return node.children ?? [];
		if (node.children) {
			const found = getSiblings(node.children, parentId);
			if (found.length > 0) return found;
		}
	}
	return [];
}

interface SortableNodeProps {
	cat: Category & { depth: number };
	expanded: boolean;
	onToggle: () => void;
	onEdit: () => void;
	onDelete: () => void;
	onAssign: () => void;
	onToggleActive: () => void;
}

function SortableNode({
	cat,
	expanded,
	onToggle,
	onEdit,
	onDelete,
	onAssign,
	onToggleActive,
}: SortableNodeProps) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({
		id: cat.id,
	});

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isDragging ? 0.5 : 1,
	};

	const hasChildren =
		(cat.children?.length ?? 0) > 0 || (cat.child_count ?? 0) > 0;

	return (
		<div
			ref={setNodeRef}
			style={{ ...style, paddingLeft: `${cat.depth * 24 + 8}px` }}
			className="flex items-center gap-2 py-2 pr-4 border-b border-gray-100 bg-linen hover:bg-pearl/50 group"
		>
			<button
				type="button"
				{...attributes}
				{...listeners}
				className="cursor-grab text-taupe hover:text-taupe touch-none"
				aria-label="Drag to reorder"
			>
				<GripVertical size={16} />
			</button>

			{hasChildren ? (
				<button
					type="button"
					onClick={onToggle}
					className="text-taupe hover:text-cacao flex-shrink-0"
					aria-label={expanded ? "Collapse" : "Expand"}
				>
					{expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
				</button>
			) : (
				<span className="w-4 flex-shrink-0" />
			)}

			<span
				className={`flex-1 text-sm font-medium ${
					cat.is_active === false ? "text-taupe line-through" : "text-cacao"
				}`}
			>
				{cat.name}
			</span>
			{cat.is_active === false && (
				<span className="mr-2 rounded bg-pearl/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-taupe">
					Disabled
				</span>
			)}
			<span className="text-xs text-taupe mr-2">
				{cat.child_count ?? cat.children?.length ?? 0} children
			</span>

			<div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
				<button
					type="button"
					onClick={onToggleActive}
					className="p-1 rounded hover:bg-pearl/100 text-taupe"
					title={cat.is_active === false ? "Enable" : "Disable"}
				>
					{cat.is_active === false ? <EyeOff size={14} /> : <Eye size={14} />}
				</button>
				<button
					type="button"
					onClick={onAssign}
					className="p-1 rounded hover:bg-blue-50 text-amber"
					title="Assign Attributes"
				>
					<Tag size={14} />
				</button>
				<button
					type="button"
					onClick={onEdit}
					className="p-1 rounded hover:bg-pearl/100 text-taupe"
					title="Edit"
				>
					<Pencil size={14} />
				</button>
				<button
					type="button"
					onClick={onDelete}
					className="p-1 rounded hover:bg-red-50 text-red-500"
					title="Delete"
				>
					<Trash2 size={14} />
				</button>
			</div>
		</div>
	);
}

interface AssignAttributesDialogProps {
	category: Category | null;
	onClose: () => void;
}

function AssignAttributesDialog({
	category,
	onClose,
}: AssignAttributesDialogProps) {
	const { data: categoryAttrs } = useCategoryAttributes(category?.id);
	const { mutate: assign, isPending } = useAssignAttributes();
	const [selected, setSelected] = useState<string[]>([]);

	useEffect(() => {
		if (categoryAttrs) {
			setSelected(categoryAttrs.map((a: { id: string }) => a.id));
		} else {
			setSelected([]);
		}
	}, [categoryAttrs]);

	function handleSubmit() {
		if (!category) return;
		assign(
			{ id: category.id, attribute_ids: selected },
			{ onSuccess: onClose },
		);
	}

	return (
		<Dialog open={!!category} onOpenChange={(o) => !o && onClose()}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Assign Attributes — {category?.name}</DialogTitle>
				</DialogHeader>
				<div className="py-6 h-64 overflow-visible">
					<EntityMultiCombobox
						values={selected}
						onChange={setSelected}
						search={searchAdminAttributesLookup}
						getById={getAdminAttributeByIdLookup}
						placeholder="Search attributes..."
						emptyMessage="No attributes found."
					/>
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={onClose}>
						Cancel
					</Button>
					<Button onClick={handleSubmit} disabled={isPending}>
						{isPending ? "Saving..." : "Save"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export default function CategoriesPage() {
	const { data: treeData, isLoading } = useAdminCategoryTree();
	const { mutate: deleteCategory } = useDeleteCategory();
	const { mutate: reorder } = useReorderCategories();
	const { mutate: toggleActive } = useToggleCategoryActive();

	const [expanded, setExpanded] = useState<Set<string>>(new Set());
	const [addOpen, setAddOpen] = useState(false);
	const [editTarget, setEditTarget] = useState<Category | null>(null);
	const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
	const [assignTarget, setAssignTarget] = useState<Category | null>(null);

	const tree: Category[] = treeData ?? [];

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
	);

	// Only show top-level nodes (or expanded children) in flat list
	function buildVisible(
		nodes: Category[],
		depth = 0,
	): Array<Category & { depth: number }> {
		const result: Array<Category & { depth: number }> = [];
		for (const node of nodes) {
			result.push({ ...node, depth });
			if (expanded.has(node.id) && node.children && node.children.length > 0) {
				result.push(...buildVisible(node.children, depth + 1));
			}
		}
		return result;
	}

	const visible = buildVisible(tree);

	function toggleExpand(id: string) {
		setExpanded((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}

	const handleDragEnd = useCallback(
		(event: DragEndEvent) => {
			const { active, over } = event;
			if (!over || active.id === over.id) return;

			const activeNode = visible.find((v) => v.id === active.id);
			const overNode = visible.find((v) => v.id === over.id);
			if (!activeNode || !overNode) return;

			// Only reorder within same parent
			if (activeNode.parent_id !== overNode.parent_id) return;

			const siblings = getSiblings(tree, activeNode.parent_id);
			const oldIndex = siblings.findIndex((s) => s.id === active.id);
			const newIndex = siblings.findIndex((s) => s.id === over.id);
			if (oldIndex === -1 || newIndex === -1) return;

			const reordered = arrayMove(siblings, oldIndex, newIndex);
			const items = reordered.map((s, i) => ({ id: s.id, sort_order: i }));
			reorder(items);
		},
		[visible, tree, reorder],
	);

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold text-cacao mb-1">Categories</h1>
					<p className="text-taupe text-sm">
						Manage product category tree. Drag to reorder within a level.
					</p>
				</div>
				<Button onClick={() => setAddOpen(true)}>
					<Plus size={16} className="mr-2" />
					Add Category
				</Button>
			</div>

			{isLoading ? (
				<div className="space-y-2">
					{Array.from({ length: 8 }, (_, i) => `skel-${i}`).map((k) => (
						<Skeleton key={k} className="h-10 w-full rounded" />
					))}
				</div>
			) : visible.length === 0 ? (
				<div className="text-center py-12 text-taupe text-sm">
					No categories yet. Add one to get started.
				</div>
			) : (
				<div className="border border-gray-200 rounded-lg overflow-hidden">
					<DndContext
						sensors={sensors}
						collisionDetection={closestCenter}
						onDragEnd={handleDragEnd}
					>
						<SortableContext
							items={visible.map((v) => v.id)}
							strategy={verticalListSortingStrategy}
						>
							{visible.map((cat) => (
								<SortableNode
									key={cat.id}
									cat={cat}
									expanded={expanded.has(cat.id)}
									onToggle={() => toggleExpand(cat.id)}
									onEdit={() => setEditTarget(cat)}
									onDelete={() => setDeleteTarget(cat)}
									onAssign={() => setAssignTarget(cat)}
									onToggleActive={() =>
										toggleActive({
											id: cat.id,
											is_active: !(cat.is_active ?? true),
										})
									}
								/>
							))}
						</SortableContext>
					</DndContext>
				</div>
			)}

			{/* Add Dialog */}
			<CategoryFormDialog
				key={addOpen ? "add-open" : "add-closed"}
				open={addOpen}
				category={null}
				allCategories={tree}
				onClose={() => setAddOpen(false)}
			/>

			{/* Edit Dialog */}
			{editTarget && (
				<CategoryFormDialog
					key={editTarget.id}
					open={!!editTarget}
					category={editTarget}
					allCategories={tree}
					onClose={() => setEditTarget(null)}
				/>
			)}

			{/* Assign Attributes Dialog */}
			<AssignAttributesDialog
				category={assignTarget}
				onClose={() => setAssignTarget(null)}
			/>

			{/* Delete Confirm Dialog */}
			<Dialog
				open={!!deleteTarget}
				onOpenChange={(o) => !o && setDeleteTarget(null)}
			>
				<DialogContent className="sm:max-w-sm">
					<DialogHeader>
						<DialogTitle>Delete Category</DialogTitle>
					</DialogHeader>
					<p className="text-sm text-taupe py-2">
						Are you sure you want to delete{" "}
						<strong>{deleteTarget?.name}</strong>? This cannot be undone.
					</p>
					<DialogFooter>
						<Button variant="outline" onClick={() => setDeleteTarget(null)}>
							Cancel
						</Button>
						<Button
							variant="destructive"
							onClick={() => {
								if (deleteTarget) {
									deleteCategory(deleteTarget.id, {
										onSuccess: () => setDeleteTarget(null),
									});
								}
							}}
						>
							Delete
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
