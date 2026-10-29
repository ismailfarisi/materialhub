"use client";

import {
	type Attribute,
	type AttributeValue,
	type FilterInputType,
	useAttributeValues,
	useAttributes,
	useCreateAttribute,
	useCreateAttributeValue,
	useDeleteAttribute,
	useDeleteAttributeValue,
	useUpdateAttribute,
	useUpdateAttributeValue,
} from "@/lib/queries/attributes";
import {
	Button,
	DataTable,
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Input,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	Skeleton,
	StatusBadge,
} from "@materialhub/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { ReindexSearchButton } from "./reindex-button";

const ATTRIBUTE_TYPES = [
	{ label: "Text", value: "text" },
	{ label: "Number", value: "number" },
	{ label: "Color", value: "color" },
	{ label: "Select", value: "select" },
];

const FILTER_INPUT_OPTIONS_BY_TYPE: Record<
	string,
	Array<{ label: string; value: FilterInputType }>
> = {
	color: [
		{ label: "Color swatch (multi-select)", value: "color_swatch" },
		{ label: "Checkbox list", value: "checkbox" },
	],
	number: [
		{ label: "Range slider", value: "range" },
		{ label: "Checkbox list", value: "checkbox" },
	],
	boolean: [
		{ label: "Toggle pill", value: "toggle" },
		{ label: "Checkbox list", value: "checkbox" },
	],
	select: [
		{ label: "Checkbox list (multi-select)", value: "checkbox" },
		{ label: "Radio (single-select)", value: "radio" },
	],
	multi_select: [
		{ label: "Checkbox list (multi-select)", value: "checkbox" },
		{ label: "Radio (single-select)", value: "radio" },
	],
	text: [],
	date: [],
};

const DEFAULT_FILTER_INPUT_BY_TYPE: Record<string, FilterInputType | null> = {
	color: "color_swatch",
	number: "range",
	boolean: "toggle",
	select: "checkbox",
	multi_select: "checkbox",
	text: null,
	date: null,
};

const ATTRIBUTE_TABLE_SKELETON_KEYS = Array.from(
	{ length: 6 },
	(_, index) => `attribute-row-skeleton-${index}`,
);

function AttributeValueRow({
	attrId,
	attrType,
	value,
}: {
	attrId: string;
	attrType: string;
	value: AttributeValue;
}) {
	const isColor = attrType === "color";
	const [editing, setEditing] = useState(false);
	const [editVal, setEditVal] = useState(value.value);
	const [editLabel, setEditLabel] = useState(value.display_value ?? "");
	const [editHex, setEditHex] = useState(value.color_hex ?? "");
	const [confirmDelete, setConfirmDelete] = useState(false);

	const { mutate: update, isPending: updating } = useUpdateAttributeValue();
	const { mutate: deleteVal, isPending: deleting } = useDeleteAttributeValue();

	if (editing) {
		return (
			<div className="flex items-center gap-2 py-1">
				<Input
					value={editVal}
					onChange={(e) => setEditVal(e.target.value)}
					className="h-7 text-xs w-32"
					placeholder="Value"
				/>
				<Input
					value={editLabel}
					onChange={(e) => setEditLabel(e.target.value)}
					className="h-7 text-xs w-32"
					placeholder="Display label"
				/>
				{isColor && (
					<div className="flex items-center gap-1.5">
						<span
							className="w-5 h-5 rounded-full border border-gray-300 shrink-0"
							style={{ backgroundColor: editHex || "transparent" }}
						/>
						<Input
							value={editHex}
							onChange={(e) => setEditHex(e.target.value)}
							className="h-7 text-xs w-24"
							placeholder="#RRGGBB"
						/>
					</div>
				)}
				<Button
					size="sm"
					className="h-7 text-xs"
					disabled={updating}
					onClick={() =>
						update(
							{
								attrId,
								valueId: value.id,
								value: editVal,
								display_value: editLabel || undefined,
								color_hex: isColor ? editHex.trim() || null : undefined,
							},
							{ onSuccess: () => setEditing(false) },
						)
					}
				>
					{updating ? "..." : "Save"}
				</Button>
				<Button
					size="sm"
					variant="ghost"
					className="h-7 text-xs"
					onClick={() => setEditing(false)}
				>
					Cancel
				</Button>
			</div>
		);
	}

	return (
		<div className="flex items-center gap-3 py-1 group">
			{isColor && (
				<span
					className="w-4 h-4 rounded-full border border-gray-300 shrink-0"
					style={{ backgroundColor: value.color_hex || "transparent" }}
					title={value.color_hex ?? "No hex set"}
				/>
			)}
			<span className="text-sm text-cacao w-32">{value.value}</span>
			<span className="text-xs text-taupe w-32">
				{value.display_value ?? "—"}
			</span>
			{isColor && (
				<span className="text-xs font-mono text-taupe w-20">
					{value.color_hex ?? "—"}
				</span>
			)}
			<div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
				<button
					type="button"
					onClick={() => setEditing(true)}
					className="p-1 rounded hover:bg-pearl/100 text-taupe"
					title="Edit"
				>
					<Pencil size={12} />
				</button>
				<button
					type="button"
					onClick={() => setConfirmDelete(true)}
					className="p-1 rounded hover:bg-red-50 text-red-500"
					title="Delete"
				>
					<Trash2 size={12} />
				</button>
			</div>

			<Dialog
				open={confirmDelete}
				onOpenChange={(o) => !o && setConfirmDelete(false)}
			>
				<DialogContent className="sm:max-w-sm">
					<DialogHeader>
						<DialogTitle>Delete Value</DialogTitle>
					</DialogHeader>
					<p className="text-sm text-taupe py-2">
						Delete value <strong>{value.value}</strong>?
					</p>
					<DialogFooter>
						<Button variant="outline" onClick={() => setConfirmDelete(false)}>
							Cancel
						</Button>
						<Button
							variant="destructive"
							disabled={deleting}
							onClick={() =>
								deleteVal(
									{ attrId, valueId: value.id },
									{ onSuccess: () => setConfirmDelete(false) },
								)
							}
						>
							{deleting ? "Deleting..." : "Delete"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}

function AttributeValuesPanel({
	attrId,
	attrType,
}: {
	attrId: string;
	attrType: string;
}) {
	const isColor = attrType === "color";
	const { data, isLoading } = useAttributeValues(attrId);
	const { mutate: createValue, isPending: creating } =
		useCreateAttributeValue();
	const [newValue, setNewValue] = useState("");
	const [newLabel, setNewLabel] = useState("");
	const [newHex, setNewHex] = useState("");

	const values: AttributeValue[] = data ?? [];

	function handleAdd() {
		if (!newValue.trim()) return;
		createValue(
			{
				attrId,
				value: newValue.trim(),
				display_value: newLabel.trim() || undefined,
				color_hex: isColor ? newHex.trim() || null : undefined,
			},
			{
				onSuccess: () => {
					setNewValue("");
					setNewLabel("");
					setNewHex("");
				},
			},
		);
	}

	if (isLoading) {
		return (
			<div className="px-4 py-3 bg-pearl/50 border-t">
				<Skeleton className="h-6 w-48" />
			</div>
		);
	}

	return (
		<div className="px-6 py-3 bg-pearl/50 border-t border-gray-200">
			<div className="mb-2">
				<div className="flex items-center gap-3 mb-1">
					{isColor && <span className="w-4 shrink-0" />}
					<span className="text-xs font-semibold text-taupe uppercase w-32">
						Value
					</span>
					<span className="text-xs font-semibold text-taupe uppercase w-32">
						Display Label
					</span>
					{isColor && (
						<span className="text-xs font-semibold text-taupe uppercase w-20">
							Hex
						</span>
					)}
				</div>
				{values.length === 0 ? (
					<p className="text-xs text-taupe py-1">No values yet.</p>
				) : (
					values.map((v) => (
						<AttributeValueRow
							key={v.id}
							attrId={attrId}
							attrType={attrType}
							value={v}
						/>
					))
				)}
			</div>
			{/* Add new value */}
			<div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-200">
				<Input
					value={newValue}
					onChange={(e) => setNewValue(e.target.value)}
					className="h-7 text-xs w-32"
					placeholder="New value"
					onKeyDown={(e) => e.key === "Enter" && handleAdd()}
				/>
				<Input
					value={newLabel}
					onChange={(e) => setNewLabel(e.target.value)}
					className="h-7 text-xs w-32"
					placeholder="Display label"
					onKeyDown={(e) => e.key === "Enter" && handleAdd()}
				/>
				{isColor && (
					<div className="flex items-center gap-1.5">
						<span
							className="w-5 h-5 rounded-full border border-gray-300 shrink-0"
							style={{ backgroundColor: newHex || "transparent" }}
						/>
						<Input
							value={newHex}
							onChange={(e) => setNewHex(e.target.value)}
							className="h-7 text-xs w-24"
							placeholder="#RRGGBB"
							onKeyDown={(e) => e.key === "Enter" && handleAdd()}
						/>
					</div>
				)}
				<Button
					size="sm"
					className="h-7 text-xs"
					disabled={creating || !newValue.trim()}
					onClick={handleAdd}
				>
					{creating ? (
						"..."
					) : (
						<>
							<Plus size={12} className="mr-1" />
							Add
						</>
					)}
				</Button>
			</div>
		</div>
	);
}

interface AttributeFormDialogProps {
	open: boolean;
	attribute?: Attribute | null;
	onClose: () => void;
}

function AttributeFormDialog({
	open,
	attribute,
	onClose,
}: AttributeFormDialogProps) {
	const [name, setName] = useState(attribute?.name ?? "");
	const [arLabel, setArLabel] = useState(attribute?.ar_label ?? "");
	const [type, setType] = useState<string>(attribute?.type ?? "text");
	const [isVariant, setIsVariant] = useState(attribute?.is_variant ?? false);
	const [isGroupable, setIsGroupable] = useState(
		attribute?.is_groupable ?? false,
	);
	const [isFilterable, setIsFilterable] = useState(
		attribute?.is_filterable ?? false,
	);
	const [filterInputType, setFilterInputType] =
		useState<FilterInputType | null>(attribute?.filter_input_type ?? null);

	const { mutate: create, isPending: creating } = useCreateAttribute();
	const { mutate: update, isPending: updating } = useUpdateAttribute();
	const isPending = creating || updating;

	useEffect(() => {
		setName(attribute?.name ?? "");
		setArLabel(attribute?.ar_label ?? "");
		setType(attribute?.type ?? "text");
		setIsVariant(attribute?.is_variant ?? false);
		setIsGroupable(attribute?.is_groupable ?? false);
		setIsFilterable(attribute?.is_filterable ?? false);
		setFilterInputType(attribute?.filter_input_type ?? null);
	}, [attribute]);

	// Reset filter_input_type to the new type's default when the user
	// explicitly changes type in the picker — NOT on initial attribute load,
	// which would silently overwrite the saved value during edit.
	function handleTypeChange(next: string) {
		setType(next);
		setFilterInputType(DEFAULT_FILTER_INPUT_BY_TYPE[next] ?? null);
	}

	useEffect(() => {
		if (!isFilterable) setFilterInputType(null);
	}, [isFilterable]);

	function handleSubmit() {
		if (!name.trim()) return;
		const body = {
			name: name.trim(),
			ar_label: arLabel.trim() || null,
			type,
			is_variant: isVariant,
			is_groupable: type === "select" || type === "color" ? isGroupable : false,
			is_filterable: isFilterable,
			filter_input_type: isFilterable ? filterInputType : null,
		};
		if (attribute) {
			update({ id: attribute.id, ...body }, { onSuccess: onClose });
		} else {
			create(body, { onSuccess: onClose });
		}
	}

	return (
		<Dialog open={open} onOpenChange={(o) => !o && onClose()}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>
						{attribute ? "Edit Attribute" : "Add Attribute"}
					</DialogTitle>
				</DialogHeader>
				<div className="space-y-4 py-2">
					<div>
						<label
							htmlFor="attribute-name"
							className="block text-sm font-medium text-cacao mb-1"
						>
							Name
						</label>
						<Input
							id="attribute-name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="e.g. Color, Size"
						/>
					</div>
					<div>
						<label
							htmlFor="attribute-ar-label"
							className="block text-sm font-medium text-cacao mb-1"
						>
							Arabic label
						</label>
						<Input
							id="attribute-ar-label"
							value={arLabel}
							onChange={(e) => setArLabel(e.target.value)}
							placeholder="e.g. اللون، المقاس"
							dir="rtl"
						/>
					</div>
					<div>
						<div className="block text-sm font-medium text-cacao mb-1">
							Type
						</div>
						<Select value={type} onValueChange={handleTypeChange}>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{ATTRIBUTE_TYPES.map((t) => (
									<SelectItem key={t.value} value={t.value}>
										{t.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<label className="flex items-center gap-2 cursor-pointer">
						<input
							type="checkbox"
							checked={isVariant}
							onChange={(e) => setIsVariant(e.target.checked)}
							className="rounded border-gray-300"
						/>
						<span className="text-sm text-cacao">
							Used for product variants
						</span>
					</label>

					<label className="flex items-center gap-2 cursor-pointer">
						<input
							type="checkbox"
							checked={isGroupable}
							disabled={type !== "select" && type !== "color"}
							onChange={(e) => setIsGroupable(e.target.checked)}
							className="rounded border-gray-300"
						/>
						<span className="text-sm text-cacao">
							Can define a product family (color/shade group)
						</span>
					</label>

					<label className="flex items-center gap-2 cursor-pointer">
						<input
							type="checkbox"
							checked={isFilterable}
							onChange={(e) => setIsFilterable(e.target.checked)}
							className="rounded border-gray-300"
						/>
						<span className="text-sm text-cacao">Show as catalog filter</span>
					</label>

					{isFilterable &&
						(FILTER_INPUT_OPTIONS_BY_TYPE[type]?.length ?? 0) > 0 && (
							<div>
								<div className="block text-sm font-medium text-cacao mb-1">
									Filter UI
								</div>
								<Select
									value={filterInputType ?? ""}
									onValueChange={(v) =>
										setFilterInputType(v as FilterInputType)
									}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{FILTER_INPUT_OPTIONS_BY_TYPE[type].map((opt) => (
											<SelectItem key={opt.value} value={opt.value}>
												{opt.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<p className="text-xs text-taupe mt-1">
									How shoppers pick values in the catalog filter sidebar. The
									variant picker on the product page is controlled by "Type"
									above.
								</p>
							</div>
						)}

					{isFilterable &&
						(FILTER_INPUT_OPTIONS_BY_TYPE[type]?.length ?? 0) === 0 && (
							<p className="text-xs text-amber-600">
								Attributes of type "{type}" cannot be filtered in the catalog.
							</p>
						)}
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={onClose}>
						Cancel
					</Button>
					<Button onClick={handleSubmit} disabled={isPending || !name.trim()}>
						{isPending ? "Saving..." : attribute ? "Save" : "Create"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export default function AttributesPage() {
	const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 });
	const [addOpen, setAddOpen] = useState(false);
	const [editTarget, setEditTarget] = useState<Attribute | null>(null);
	const [deleteTarget, setDeleteTarget] = useState<Attribute | null>(null);
	const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

	const { data, isLoading } = useAttributes({
		page: pagination.pageIndex + 1,
		limit: pagination.pageSize,
	});
	const { mutate: deleteAttr, isPending: deleting } = useDeleteAttribute();

	const attributes: Attribute[] = data?.data ?? [];
	const total: number = data?.total ?? 0;
	const pageCount = Math.ceil(total / pagination.pageSize) || 1;

	function toggleRow(id: string) {
		setExpandedRows((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}

	const columns: ColumnDef<Attribute>[] = [
		{
			id: "expand",
			header: "",
			cell: ({ row }) => (
				<button
					type="button"
					onClick={() => toggleRow(row.original.id)}
					className="p-1 text-taupe hover:text-cacao"
					title={
						expandedRows.has(row.original.id)
							? "Collapse values"
							: "Expand values"
					}
				>
					{expandedRows.has(row.original.id) ? (
						<ChevronDown size={16} />
					) : (
						<ChevronRight size={16} />
					)}
				</button>
			),
		},
		{
			accessorKey: "name",
			header: "Name",
			cell: ({ row }) => (
				<span className="font-medium text-cacao">{row.original.name}</span>
			),
		},
		{
			accessorKey: "type",
			header: "Type",
			cell: ({ row }) => (
				<span className="capitalize text-sm text-taupe">
					{row.original.type}
				</span>
			),
		},
		{
			accessorKey: "is_variant",
			header: "Variant",
			cell: ({ row }) => (
				<StatusBadge
					status={row.original.is_variant ? "variant" : "non-variant"}
				/>
			),
		},
		{
			accessorKey: "value_count",
			header: "Values",
			cell: ({ row }) => row.original.value_count ?? "—",
		},
		{
			id: "actions",
			header: "",
			cell: ({ row }) => (
				<div className="flex items-center gap-2 justify-end">
					<Button
						size="sm"
						variant="ghost"
						onClick={() => setEditTarget(row.original)}
					>
						<Pencil size={14} />
					</Button>
					<Button
						size="sm"
						variant="ghost"
						className="text-red-500 hover:text-red-700 hover:bg-red-50"
						onClick={() => setDeleteTarget(row.original)}
					>
						<Trash2 size={14} />
					</Button>
				</div>
			),
		},
	];

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold text-cacao mb-1">Attributes</h1>
					<p className="text-taupe text-sm">
						Manage product attributes and their values.
					</p>
				</div>
				<div className="flex items-center gap-3">
					<ReindexSearchButton />
					<Button onClick={() => setAddOpen(true)}>
						<Plus size={16} className="mr-2" />
						Add Attribute
					</Button>
				</div>
			</div>

			{/* Custom table with expandable rows */}
			<div className="border border-gray-200 rounded-lg overflow-hidden">
				{isLoading ? (
					<div className="space-y-2 p-4">
						{ATTRIBUTE_TABLE_SKELETON_KEYS.map((key) => (
							<Skeleton key={key} className="h-10 w-full rounded" />
						))}
					</div>
				) : attributes.length === 0 ? (
					<div className="text-center py-12 text-taupe text-sm">
						No attributes yet. Add one to get started.
					</div>
				) : (
					<>
						{/* Header */}
						<div className="grid grid-cols-[32px_1fr_120px_140px_100px_80px_80px] gap-3 items-center px-4 py-2 bg-pearl/50 border-b border-gray-200 text-xs font-semibold text-taupe uppercase">
							<span />
							<span>Name</span>
							<span>Type</span>
							<span>Filter UI</span>
							<span>Variant</span>
							<span>Values</span>
							<span />
						</div>
						{attributes.map((attr) => (
							<div key={attr.id}>
								<div className="grid grid-cols-[32px_1fr_120px_140px_100px_80px_80px] gap-3 items-center px-4 py-3 border-b border-gray-100 hover:bg-pearl/50">
									<button
										type="button"
										onClick={() => toggleRow(attr.id)}
										className="p-1 text-taupe hover:text-cacao"
									>
										{expandedRows.has(attr.id) ? (
											<ChevronDown size={16} />
										) : (
											<ChevronRight size={16} />
										)}
									</button>
									<div className="min-w-0">
										<div className="font-medium text-cacao text-sm">
											{attr.name}
										</div>
										{attr.ar_label && (
											<div className="text-xs text-taupe" dir="rtl">
												{attr.ar_label}
											</div>
										)}
									</div>
									<span className="capitalize text-sm text-taupe">
										{attr.type}
									</span>
									<span className="text-sm text-taupe">
										{attr.filter_input_type
											? attr.filter_input_type.replace("_", " ")
											: "—"}
									</span>
									<StatusBadge
										status={attr.is_variant ? "variant" : "non-variant"}
									/>
									<span className="text-sm text-taupe">
										{attr.value_count ?? "—"}
									</span>
									<div className="flex items-center gap-1 justify-end">
										<Button
											size="sm"
											variant="ghost"
											onClick={() => setEditTarget(attr)}
										>
											<Pencil size={14} />
										</Button>
										<Button
											size="sm"
											variant="ghost"
											className="text-red-500 hover:text-red-700 hover:bg-red-50"
											onClick={() => setDeleteTarget(attr)}
										>
											<Trash2 size={14} />
										</Button>
									</div>
								</div>
								{expandedRows.has(attr.id) && (
									<AttributeValuesPanel
										attrId={attr.id}
										attrType={attr.type}
									/>
								)}
							</div>
						))}
					</>
				)}
			</div>

			{/* Pagination info */}
			{total > pagination.pageSize && (
				<div className="flex items-center justify-between text-sm text-taupe">
					<span>
						Showing {pagination.pageIndex * pagination.pageSize + 1}–
						{Math.min((pagination.pageIndex + 1) * pagination.pageSize, total)}{" "}
						of {total}
					</span>
					<div className="flex gap-2">
						<Button
							size="sm"
							variant="outline"
							disabled={pagination.pageIndex === 0}
							onClick={() =>
								setPagination((p) => ({ ...p, pageIndex: p.pageIndex - 1 }))
							}
						>
							Previous
						</Button>
						<Button
							size="sm"
							variant="outline"
							disabled={pagination.pageIndex >= pageCount - 1}
							onClick={() =>
								setPagination((p) => ({ ...p, pageIndex: p.pageIndex + 1 }))
							}
						>
							Next
						</Button>
					</div>
				</div>
			)}

			{/* Add / Edit Dialog */}
			<AttributeFormDialog
				open={addOpen}
				attribute={null}
				onClose={() => setAddOpen(false)}
			/>
			{editTarget && (
				<AttributeFormDialog
					open={!!editTarget}
					attribute={editTarget}
					onClose={() => setEditTarget(null)}
				/>
			)}

			{/* Delete Confirm */}
			<Dialog
				open={!!deleteTarget}
				onOpenChange={(o) => !o && setDeleteTarget(null)}
			>
				<DialogContent className="sm:max-w-sm">
					<DialogHeader>
						<DialogTitle>Delete Attribute</DialogTitle>
					</DialogHeader>
					<p className="text-sm text-taupe py-2">
						Are you sure you want to delete{" "}
						<strong>{deleteTarget?.name}</strong>? All its values will also be
						deleted.
					</p>
					<DialogFooter>
						<Button variant="outline" onClick={() => setDeleteTarget(null)}>
							Cancel
						</Button>
						<Button
							variant="destructive"
							disabled={deleting}
							onClick={() => {
								if (deleteTarget) {
									deleteAttr(deleteTarget.id, {
										onSuccess: () => setDeleteTarget(null),
									});
								}
							}}
						>
							{deleting ? "Deleting..." : "Delete"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
