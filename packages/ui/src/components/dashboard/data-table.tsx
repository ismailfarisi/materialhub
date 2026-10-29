"use client";

import { ArrowsDownUp } from "@phosphor-icons/react";
import {
	type ColumnDef,
	type OnChangeFn,
	type PaginationState,
	type RowData,
	type RowSelectionState,
	type SortingState,
	flexRender,
	getCoreRowModel,
	useReactTable,
} from "@tanstack/react-table";
import { useState } from "react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Input } from "../ui/input";
import { Skeleton } from "../ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "../ui/table";

// Compact page list: always the first and last page, plus a window around the
// current one, with "…" standing in for the pages that were dropped.
// `current` and the returned page numbers are 1-based.
export function buildPageList(
	current: number,
	total: number,
): Array<number | "gap"> {
	if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
	const wanted = new Set([1, total, current - 1, current, current + 1]);
	if (current <= 3) for (const p of [2, 3, 4]) wanted.add(p);
	if (current >= total - 2)
		for (const p of [total - 3, total - 2, total - 1]) wanted.add(p);
	const pages = [...wanted]
		.filter((p) => p >= 1 && p <= total)
		.sort((a, b) => a - b);
	const out: Array<number | "gap"> = [];
	let previous = 0;
	for (const page of pages) {
		// A gap standing in for a single page costs the same width as the page
		// itself, so render the number instead.
		if (page - previous === 2 && previous > 0) out.push(page - 1);
		else if (previous > 0 && page - previous > 2) out.push("gap");
		out.push(page);
		previous = page;
	}
	return out;
}

declare module "@tanstack/react-table" {
	// Mobile card overrides: cardLabel sets the field label; cardTitle marks the title cell.
	interface ColumnMeta<TData extends RowData, TValue> {
		cardLabel?: string;
		cardTitle?: boolean;
	}
}

interface DataTableProps<TData, TValue> {
	columns: ColumnDef<TData, TValue>[];
	data: TData[];
	pagination?: PaginationState;
	pageCount?: number;
	totalCount?: number;
	itemLabel?: string;
	onPaginationChange?: OnChangeFn<PaginationState>;
	sorting?: SortingState;
	onSortingChange?: OnChangeFn<SortingState>;
	enableRowSelection?: boolean;
	onRowSelectionChange?: OnChangeFn<RowSelectionState>;
	isLoading?: boolean;
	rowId?: keyof TData & string;
}

export function DataTable<TData, TValue>({
	columns,
	data,
	pagination,
	pageCount,
	totalCount,
	itemLabel,
	onPaginationChange,
	sorting,
	onSortingChange,
	enableRowSelection = false,
	onRowSelectionChange,
	isLoading = false,
	rowId,
}: DataTableProps<TData, TValue>) {
	const selectionColumn: ColumnDef<TData, TValue> = {
		id: "__select__",
		header: ({ table }) => (
			<Checkbox
				checked={
					table.getIsAllPageRowsSelected()
						? true
						: table.getIsSomePageRowsSelected()
							? "indeterminate"
							: false
				}
				onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
				aria-label="Select all"
			/>
		),
		cell: ({ row }) => (
			<Checkbox
				checked={row.getIsSelected()}
				onCheckedChange={(value) => row.toggleSelected(!!value)}
				aria-label="Select row"
			/>
		),
		enableSorting: false,
		enableHiding: false,
	};

	const resolvedColumns = enableRowSelection
		? [selectionColumn, ...columns]
		: columns;

	const table = useReactTable({
		data,
		columns: resolvedColumns,
		...(rowId ? { getRowId: (row: TData) => String(row[rowId]) } : {}),
		pageCount: pageCount ?? -1,
		state: {
			...(pagination ? { pagination } : {}),
			...(sorting ? { sorting } : {}),
			...(enableRowSelection && onRowSelectionChange ? {} : {}),
		},
		onPaginationChange,
		onSortingChange,
		onRowSelectionChange,
		manualPagination: !!onPaginationChange,
		manualSorting: !!onSortingChange,
		enableRowSelection,
		getCoreRowModel: getCoreRowModel(),
	});

	const currentPage = pagination?.pageIndex ?? 0;
	const totalPages = pageCount ?? 0;
	const [jumpValue, setJumpValue] = useState("");

	function goToPage(pageIndex: number) {
		if (!pagination || !onPaginationChange) return;
		const maxIndex = totalPages > 0 ? totalPages - 1 : pageIndex;
		onPaginationChange({
			...pagination,
			pageIndex: Math.min(Math.max(0, pageIndex), maxIndex),
		});
	}

	function submitJump() {
		const page = Number.parseInt(jumpValue, 10);
		if (
			!Number.isFinite(page) ||
			page < 1 ||
			(totalPages > 0 && page > totalPages)
		)
			return;
		goToPage(page - 1);
		setJumpValue("");
	}

	return (
		<div className="flex flex-col gap-4">
			<div className="rounded-lg border border-pearl/14 overflow-hidden">
				<Table data-stack="md">
					<TableHeader>
						{table.getHeaderGroups().map((headerGroup) => (
							<TableRow
								key={headerGroup.id}
								className="border-b border-pearl/14 bg-pearl/10"
							>
								{headerGroup.headers.map((header) => {
									const canSort = header.column.getCanSort();
									return (
										<TableHead
											key={header.id}
											className={cn(
												"text-xs font-semibold text-taupe uppercase tracking-wide",
												canSort && "cursor-pointer select-none",
											)}
											onClick={
												canSort
													? header.column.getToggleSortingHandler()
													: undefined
											}
										>
											{header.isPlaceholder ? null : (
												<div className="flex items-center gap-1">
													{flexRender(
														header.column.columnDef.header,
														header.getContext(),
													)}
													{canSort && (
														<ArrowsDownUp className="ml-2 h-4 w-4 text-taupe hover:text-amber" />
													)}
												</div>
											)}
										</TableHead>
									);
								})}
							</TableRow>
						))}
					</TableHeader>
					<TableBody>
						{isLoading ? (
							Array.from({ length: pagination?.pageSize ?? 5 }).map((_, i) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: placeholder skeletons have no stable identity
								<TableRow key={`skeleton-row-${i}`}>
									{resolvedColumns.map((_, j) => (
										// biome-ignore lint/suspicious/noArrayIndexKey: placeholder skeletons have no stable identity
										<TableCell key={`skeleton-cell-${j}`} data-card-full="">
											<Skeleton className="h-4 w-full" />
										</TableCell>
									))}
								</TableRow>
							))
						) : table.getRowModel().rows.length === 0 ? (
							<TableRow>
								<TableCell
									colSpan={resolvedColumns.length}
									className="h-32 text-center text-sm text-taupe"
									data-card-full=""
								>
									No results found.
								</TableCell>
							</TableRow>
						) : (
							table.getRowModel().rows.map((row) => (
								<TableRow
									key={row.id}
									data-state={row.getIsSelected() && "selected"}
									className={cn(
										"hover:bg-pearl/20 border-b border-pearl/14 transition-colors",
										row.getIsSelected() && "bg-amber/10",
									)}
								>
									{(() => {
										const cells = row.getVisibleCells();
										const labelOf = (c: (typeof cells)[number]) => {
											const h = c.column.columnDef.header;
											return (
												c.column.columnDef.meta?.cardLabel ??
												(typeof h === "string" ? h : "")
											);
										};
										const titleCellId =
											cells.find((c) => c.column.columnDef.meta?.cardTitle)
												?.id ?? cells.find((c) => labelOf(c) !== "")?.id;
										return cells.map((cell) => {
											const isTitle = cell.id === titleCellId;
											const cellProps = isTitle
												? { "data-card-title": "" }
												: { "data-label": labelOf(cell) };
											return (
												<TableCell
													key={cell.id}
													className="text-sm text-foreground"
													{...cellProps}
												>
													{flexRender(
														cell.column.columnDef.cell,
														cell.getContext(),
													)}
												</TableCell>
											);
										});
									})()}
								</TableRow>
							))
						)}
					</TableBody>
				</Table>
			</div>

			{/* Pagination controls */}
			{pagination && onPaginationChange ? (
				<nav
					aria-label="pagination"
					className="flex flex-col gap-3 px-2 sm:flex-row sm:items-center sm:justify-between"
				>
					<p className="text-sm text-taupe">
						Page {currentPage + 1} of {totalPages > 0 ? totalPages : "?"}
						{totalCount !== undefined
							? ` (${totalCount} total ${totalCount === 1 ? (itemLabel ?? "item") : (itemLabel ?? "items")})`
							: ""}
					</p>
					<div className="flex flex-wrap items-center gap-1.5 text-sm text-taupe">
						<Button
							variant="outline"
							size="sm"
							onClick={() => goToPage(currentPage - 1)}
							disabled={currentPage === 0 || isLoading}
						>
							Previous
						</Button>
						{totalPages > 0 &&
							buildPageList(currentPage + 1, totalPages).map((entry, i) =>
								entry === "gap" ? (
									<span
										// biome-ignore lint/suspicious/noArrayIndexKey: gaps have no stable identity
										key={`gap-${i}`}
										aria-hidden
										className="select-none px-1"
									>
										&hellip;
									</span>
								) : (
									<Button
										key={entry}
										variant={entry === currentPage + 1 ? "default" : "outline"}
										size="sm"
										className="min-w-9 px-2"
										aria-label={`Go to page ${entry}`}
										aria-current={
											entry === currentPage + 1 ? "page" : undefined
										}
										onClick={() => goToPage(entry - 1)}
										disabled={isLoading}
									>
										{entry}
									</Button>
								),
							)}
						<Button
							variant="outline"
							size="sm"
							onClick={() => goToPage(currentPage + 1)}
							disabled={
								isLoading || (totalPages > 0 && currentPage >= totalPages - 1)
							}
						>
							Next
						</Button>
						{totalPages > 1 && (
							<div className="ml-1 flex items-center gap-1.5">
								<span className="whitespace-nowrap">Go to</span>
								<Input
									type="number"
									min={1}
									max={totalPages}
									inputMode="numeric"
									aria-label="Go to page"
									placeholder={String(currentPage + 1)}
									value={jumpValue}
									onChange={(e) => setJumpValue(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === "Enter") {
											e.preventDefault();
											submitJump();
										}
									}}
									className="h-9 w-16 px-2 text-center"
									disabled={isLoading}
								/>
								<Button
									variant="outline"
									size="sm"
									onClick={submitJump}
									disabled={isLoading || jumpValue.trim() === ""}
								>
									Go
								</Button>
							</div>
						)}
					</div>
				</nav>
			) : totalCount !== undefined ? (
				<div className="flex items-center justify-between px-2 text-sm text-taupe">
					<p>
						Total: {totalCount}{" "}
						{totalCount === 1 ? (itemLabel ?? "item") : (itemLabel ?? "items")}
					</p>
				</div>
			) : null}
		</div>
	);
}
