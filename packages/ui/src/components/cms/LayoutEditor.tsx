"use client";

import {
	DndContext,
	type DragEndEvent,
	KeyboardSensor,
	PointerSensor,
	closestCenter,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	SortableContext,
	arrayMove,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import * as LucideIcons from "lucide-react";
import {
	AlertCircle,
	ArrowLeft,
	Check,
	ChevronDown,
	ChevronUp,
	Eye,
	EyeOff,
	GripVertical,
	Loader2,
	type LucideIcon,
	Plus,
	RotateCcw,
	Search,
	Shapes,
	Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StatusBadge } from "../dashboard/status-badge";
import { Button } from "../ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Skeleton } from "../ui/skeleton";
import { toast } from "../ui/use-toast";
import { SectionConfigEditor } from "./SectionConfigEditor";
import {
	useAddSection,
	useLayout,
	usePublishLayout,
	useRemoveSection,
	useReorderSections,
	useScheduleLayout,
	useSectionTypes,
	useUpdateSection,
} from "./queries";
import type { LayoutEditorProps, Section, SectionType } from "./types";

// Normalized hash of the editable section fields. Computed identically from
// the server payload AND from local form state so the "dirty" comparison
// doesn't false-trigger on shape differences (visibility array vs object,
// missing optional fields rendered as `{}` vs `null`, etc.).
function normalizedFormHash(
	sm: string | undefined,
	vis: string[],
	s: Record<string, unknown>,
	b: unknown[],
	ds: Record<string, unknown>,
	bc: Record<string, unknown>,
) {
	return JSON.stringify({
		sm: sm ?? "manual",
		v: [...vis].sort(),
		s: s ?? {},
		b: b ?? [],
		ds: ds ?? {},
		bc: bc ?? {},
	});
}

// Resolve the lucide-react component for a kebab- or PascalCase icon name
// (the section_types API returns kebab-case names like "shopping-bag").
function resolveSectionTypeIcon(name?: string | null): LucideIcon | null {
	if (!name) return null;
	const pascal = name
		.split(/[-_\s]+/)
		.map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
		.join("");
	const icons = LucideIcons as unknown as Record<string, LucideIcon>;
	return icons[pascal] ?? icons[name] ?? null;
}

// ─── Sortable Section Card ───────────────────────────────────────────────────

function SortableSectionCard({
	section,
	layoutId,
	expanded,
	onToggleExpand,
	onRequestDelete,
	apiClient,
	apiPathPrefix,
	mode,
	s3Client,
	vendorId,
}: {
	section: Section;
	layoutId: string;
	expanded: boolean;
	onToggleExpand: () => void;
	onRequestDelete: (section: Section) => void;
	apiClient: LayoutEditorProps["apiClient"];
	apiPathPrefix: string;
	mode: LayoutEditorProps["mode"];
	s3Client?: LayoutEditorProps["s3Client"];
	vendorId?: LayoutEditorProps["vendorId"];
}) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: section.id });

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isDragging ? 0.5 : 1,
	};

	const { mutate: updateSection, isPending: saving } = useUpdateSection(
		apiClient,
		apiPathPrefix,
		layoutId,
	);

	const SOURCE_MODES =
		mode === "vendor" ? ["manual", "query"] : ["manual", "query", "bidded"];

	// Local form state seeded from props; reset whenever the source section
	// changes (e.g. after a refetch following save).
	const [sourceMode, setSourceMode] = useState(section.source_mode ?? "manual");
	const [visibility, setVisibility] = useState<string[]>(() =>
		extractVisibility(section.visibility),
	);
	const [settings, setSettings] = useState<Record<string, unknown>>(
		section.settings ?? {},
	);
	const [blocks, setBlocks] = useState<unknown[]>(section.blocks ?? []);
	const [dataSource, setDataSource] = useState<Record<string, unknown>>(
		section.data_source ?? {},
	);
	const [bidConfig, setBidConfig] = useState<Record<string, unknown>>(
		section.bid_config ?? {},
	);

	const lastSyncedRef = useRef<string>(
		normalizedFormHash(
			section.source_mode ?? "manual",
			extractVisibility(section.visibility),
			section.settings ?? {},
			section.blocks ?? [],
			section.data_source ?? {},
			section.bid_config ?? {},
		),
	);
	const sectionPayloadHash = stableSectionHash(section);
	const lastSectionPayloadRef = useRef<string>(sectionPayloadHash);
	useEffect(() => {
		if (sectionPayloadHash === lastSectionPayloadRef.current) return;
		lastSectionPayloadRef.current = sectionPayloadHash;
		const sm = section.source_mode ?? "manual";
		const vis = extractVisibility(section.visibility);
		const s = section.settings ?? {};
		const b = section.blocks ?? [];
		const ds = section.data_source ?? {};
		const bc = section.bid_config ?? {};
		setSourceMode(sm);
		setVisibility(vis);
		setSettings(s);
		setBlocks(b);
		setDataSource(ds);
		setBidConfig(bc);
		lastSyncedRef.current = normalizedFormHash(sm, vis, s, b, ds, bc);
	}, [section, sectionPayloadHash]);

	function resetForm() {
		const sm = section.source_mode ?? "manual";
		const vis = extractVisibility(section.visibility);
		const s = section.settings ?? {};
		const b = section.blocks ?? [];
		const ds = section.data_source ?? {};
		const bc = section.bid_config ?? {};
		setSourceMode(sm);
		setVisibility(vis);
		setSettings(s);
		setBlocks(b);
		setDataSource(ds);
		setBidConfig(bc);
		lastSyncedRef.current = normalizedFormHash(sm, vis, s, b, ds, bc);
	}

	const currentHash = normalizedFormHash(
		sourceMode,
		visibility,
		settings,
		blocks,
		dataSource,
		bidConfig,
	);
	const isDirty = currentHash !== lastSyncedRef.current;

	function toggleVisibility(key: string) {
		setVisibility((prev) =>
			prev.includes(key) ? prev.filter((v) => v !== key) : [...prev, key],
		);
	}

	function handleSave() {
		updateSection(
			{
				sectionId: section.id,
				source_mode: sourceMode,
				visibility: {
					web: visibility.includes("web"),
					mobile: visibility.includes("mobile"),
				},
				settings,
				data_source: sourceMode === "query" ? dataSource : undefined,
				blocks: sourceMode === "manual" ? blocks : undefined,
				bid_config: sourceMode === "bidded" ? bidConfig : undefined,
			},
			{
				onSuccess: () =>
					toast({
						title: "Section saved",
						description: section.section_type?.label?.en ?? "Section updated.",
					}),
				onError: () =>
					toast({
						title: "Save failed",
						description: "Could not save section. Please try again.",
						variant: "destructive",
					}),
			},
		);
	}

	function handleToggleEnabled() {
		updateSection(
			{
				sectionId: section.id,
				enabled: !section.enabled,
			},
			{
				onError: () =>
					toast({
						title: "Update failed",
						description: "Could not toggle section.",
						variant: "destructive",
					}),
			},
		);
	}

	const isDisabled = !section.enabled;

	return (
		<div
			ref={setNodeRef}
			style={style}
			className={`rounded-xl border transition-all ${
				isDisabled
					? "bg-pearl/30 border-gray-200"
					: "bg-linen border-gray-200 hover:border-gray-300"
			} ${expanded ? "ring-1 ring-amber/40 shadow-sm" : ""} overflow-hidden`}
		>
			{/* Section header row */}
			<div className="flex items-center gap-3 px-4 py-3">
				<button
					type="button"
					{...attributes}
					{...listeners}
					className="text-gray-300 hover:text-taupe cursor-grab active:cursor-grabbing flex-shrink-0"
					aria-label="Drag to reorder"
					title="Drag to reorder"
				>
					<GripVertical size={18} />
				</button>

				<button
					type="button"
					onClick={onToggleExpand}
					className="flex-1 min-w-0 text-left flex items-center gap-2"
				>
					<span
						className={`font-medium text-sm truncate ${
							isDisabled ? "text-taupe" : "text-cacao"
						}`}
					>
						{section.section_type?.label?.en ?? "Unknown Section"}
					</span>
					<span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide bg-pearl/100 text-taupe border border-pearl/200">
						{sourceMode}
					</span>
					{isDisabled && (
						<span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide bg-pearl/40 text-taupe border border-pearl/40">
							Hidden
						</span>
					)}
					{expanded && isDirty && (
						<span
							className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide bg-amber/10 text-amber border border-amber/30"
							title="You have unsaved changes"
						>
							Unsaved
						</span>
					)}
				</button>

				{/* Visibility toggle */}
				<button
					type="button"
					onClick={handleToggleEnabled}
					disabled={saving}
					className={`flex-shrink-0 p-1.5 rounded transition-colors disabled:opacity-50 ${
						section.enabled
							? "text-green-600 hover:bg-green-50"
							: "text-taupe hover:bg-pearl/100"
					}`}
					aria-label={section.enabled ? "Disable section" : "Enable section"}
					title={section.enabled ? "Hide section" : "Show section"}
				>
					{saving ? (
						<Loader2 size={16} className="animate-spin" />
					) : section.enabled ? (
						<Eye size={16} />
					) : (
						<EyeOff size={16} />
					)}
				</button>

				{/* Delete (always visible in header) */}
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						onRequestDelete(section);
					}}
					className="flex-shrink-0 p-1.5 rounded text-taupe hover:text-red-600 hover:bg-red-50 transition-colors"
					aria-label="Delete section"
					title="Delete section"
				>
					<Trash2 size={16} />
				</button>

				<button
					type="button"
					onClick={onToggleExpand}
					className="flex-shrink-0 p-1.5 rounded hover:bg-pearl/100 text-taupe"
					aria-label={expanded ? "Collapse" : "Expand"}
					title={expanded ? "Collapse" : "Expand"}
				>
					{expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
				</button>
			</div>

			{/* Expanded config */}
			{expanded && (
				<div className="border-t border-gray-100 px-4 py-4 space-y-4 bg-pearl/30">
					{/* Source Mode */}
					<div>
						<p className="block text-xs font-semibold text-taupe uppercase tracking-wide mb-2">
							Source Mode
						</p>
						<div className="flex gap-3">
							{SOURCE_MODES.map((sm) => (
								<label
									key={sm}
									className="flex items-center gap-1.5 cursor-pointer"
								>
									<input
										type="radio"
										name={`source-mode-${section.id}`}
										value={sm}
										checked={sourceMode === sm}
										onChange={() => setSourceMode(sm as Section["source_mode"])}
										className="text-amber"
									/>
									<span className="text-sm capitalize">{sm}</span>
								</label>
							))}
						</div>
					</div>

					{/* Visibility */}
					<div>
						<p className="block text-xs font-semibold text-taupe uppercase tracking-wide mb-2">
							Channels
						</p>
						<div className="flex gap-4">
							{["web", "mobile"].map((v) => (
								<label
									key={v}
									className="flex items-center gap-1.5 cursor-pointer"
								>
									<input
										type="checkbox"
										checked={visibility.includes(v)}
										onChange={() => toggleVisibility(v)}
										className="rounded text-amber"
									/>
									<span className="text-sm capitalize">{v}</span>
								</label>
							))}
						</div>
					</div>

					{/* Visual Section Config Editor */}
					<SectionConfigEditor
						apiClient={apiClient}
						sectionTypeName={section.section_type?.name ?? ""}
						sourceMode={sourceMode}
						settings={settings}
						blocks={blocks}
						dataSource={dataSource}
						bidConfig={bidConfig}
						s3Client={s3Client}
						vendorId={vendorId}
						onSettingsChange={setSettings}
						onBlocksChange={setBlocks}
						onDataSourceChange={setDataSource}
						onBidConfigChange={setBidConfig}
					/>

					<div className="flex items-center gap-2 pt-1">
						<Button
							size="sm"
							onClick={handleSave}
							disabled={saving || !isDirty}
						>
							{saving ? (
								<>
									<Loader2 size={14} className="mr-1.5 animate-spin" />
									Saving…
								</>
							) : (
								<>
									<Check size={14} className="mr-1.5" />
									Save Section
								</>
							)}
						</Button>
						{isDirty && !saving && (
							<Button
								size="sm"
								variant="outline"
								onClick={resetForm}
								title="Discard your unsaved edits"
							>
								<RotateCcw size={14} className="mr-1.5" />
								Discard changes
							</Button>
						)}
					</div>
				</div>
			)}
		</div>
	);
}

// Stable hash of the server-known section fields so the local-form effect only
// resets state when the upstream payload actually changes (and not on every
// parent rerender from React Query reference changes).
function stableSectionHash(section: Section): string {
	return JSON.stringify({
		sm: section.source_mode,
		v: section.visibility,
		s: section.settings ?? null,
		b: section.blocks ?? null,
		d: section.data_source ?? null,
		bc: section.bid_config ?? null,
		e: section.enabled,
	});
}

function extractVisibility(v: Section["visibility"]): string[] {
	if (Array.isArray(v)) return v;
	if (v && typeof v === "object")
		return Object.keys(v).filter((k) => (v as Record<string, boolean>)[k]);
	return ["web", "mobile"];
}

// ─── Main LayoutEditor Component ─────────────────────────────────────────────

export function LayoutEditor({
	apiClient,
	layoutId,
	mode,
	apiPathPrefix,
	s3Client,
	vendorId,
	onPreview,
	onPublishSuccess,
	onBack,
}: LayoutEditorProps) {
	const {
		data: layout,
		isLoading,
		error: layoutError,
	} = useLayout(apiClient, apiPathPrefix, layoutId);
	const { data: rawSectionTypes, isLoading: typesLoading } =
		useSectionTypes(apiClient);
	const { mutate: publishLayout, isPending: publishing } = usePublishLayout(
		apiClient,
		apiPathPrefix,
		layoutId,
	);
	const { mutate: scheduleLayout, isPending: scheduling } = useScheduleLayout(
		apiClient,
		apiPathPrefix,
		layoutId,
	);
	const { mutate: addSection, isPending: addingSection } = useAddSection(
		apiClient,
		apiPathPrefix,
		layoutId,
	);
	const { mutate: reorderSections } = useReorderSections(
		apiClient,
		apiPathPrefix,
		layoutId,
	);
	const { mutate: removeSection, isPending: removing } = useRemoveSection(
		apiClient,
		apiPathPrefix,
		layoutId,
	);

	// Filter section types by mode
	const sectionTypes = (rawSectionTypes ?? []).filter((st: SectionType) => {
		if (mode === "vendor") return st.scope === "vendor" || st.scope === "both";
		return true; // platform mode shows all
	});

	const [expandedSectionId, setExpandedSectionId] = useState<string | null>(
		null,
	);
	// Optimistic order overrides server data only during/after a drag, until the
	// next refetch matches it. This avoids the previous "frozen state" bug where
	// the first server payload was captured and never updated.
	const [orderOverride, setOrderOverride] = useState<string[] | null>(null);

	const serverSections = useMemo<Section[]>(() => {
		const list = [...(layout?.sections ?? [])].sort(
			(a, b) => a.position - b.position,
		);
		return list;
	}, [layout?.sections]);

	const sections = useMemo<Section[]>(() => {
		if (!orderOverride) return serverSections;
		const byId = new Map(serverSections.map((s) => [s.id, s]));
		const ordered: Section[] = [];
		for (const id of orderOverride) {
			const found = byId.get(id);
			if (found) {
				ordered.push(found);
				byId.delete(id);
			}
		}
		// Append any sections present on the server but missing from override
		// (e.g. a freshly added section after the drag).
		for (const remaining of byId.values()) ordered.push(remaining);
		return ordered;
	}, [serverSections, orderOverride]);

	// Drop the override once the server reflects it, so we go back to pure
	// server-driven rendering.
	useEffect(() => {
		if (!orderOverride) return;
		const serverIds = serverSections.map((s) => s.id).join("|");
		const overrideIds = orderOverride.join("|");
		if (serverIds === overrideIds) setOrderOverride(null);
	}, [serverSections, orderOverride]);

	const [addSectionOpen, setAddSectionOpen] = useState(false);
	const [sectionTypeSearch, setSectionTypeSearch] = useState("");
	const [scheduleOpen, setScheduleOpen] = useState(false);
	const [publishAt, setPublishAt] = useState("");
	const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
	const [deleteTarget, setDeleteTarget] = useState<Section | null>(null);

	const filteredSectionTypes = useMemo(() => {
		const q = sectionTypeSearch.trim().toLowerCase();
		if (!q) return sectionTypes;
		return sectionTypes.filter((t: SectionType) => {
			const label = t.label?.en?.toLowerCase() ?? "";
			const labelAr = t.label?.ar?.toLowerCase() ?? "";
			return (
				label.includes(q) ||
				labelAr.includes(q) ||
				t.name.toLowerCase().includes(q)
			);
		});
	}, [sectionTypes, sectionTypeSearch]);

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	const handleDragEnd = useCallback(
		(event: DragEndEvent) => {
			const { active, over } = event;
			if (!over || active.id === over.id) return;

			const oldIndex = sections.findIndex((s) => s.id === active.id);
			const newIndex = sections.findIndex((s) => s.id === over.id);
			if (oldIndex === -1 || newIndex === -1) return;

			const reordered = arrayMove(sections, oldIndex, newIndex);
			setOrderOverride(reordered.map((s) => s.id));
			reorderSections(
				reordered.map((s, i) => ({ id: s.id, position: i })),
				{
					onError: () => {
						setOrderOverride(null);
						toast({
							title: "Reorder failed",
							description: "Could not save new order.",
							variant: "destructive",
						});
					},
				},
			);
		},
		[sections, reorderSections],
	);

	function handlePublish() {
		setPublishConfirmOpen(false);
		publishLayout(undefined, {
			onSuccess: () => {
				toast({
					title: "Layout published",
					description: "Your changes are live.",
				});
				onPublishSuccess?.();
			},
			onError: () =>
				toast({
					title: "Publish failed",
					description: "Could not publish layout.",
					variant: "destructive",
				}),
		});
	}

	function handleSchedule() {
		if (!publishAt) return;
		scheduleLayout(new Date(publishAt).toISOString(), {
			onSuccess: () => {
				toast({
					title: "Layout scheduled",
					description: `Will publish at ${new Date(publishAt).toLocaleString()}.`,
				});
				setScheduleOpen(false);
			},
			onError: () =>
				toast({
					title: "Schedule failed",
					description: "Could not schedule layout.",
					variant: "destructive",
				}),
		});
	}

	function handleAddSection(typeId: string) {
		addSection(
			{ section_type_id: typeId, position: sections.length },
			{
				onSuccess: (newSection: Section) => {
					setExpandedSectionId(newSection.id);
					setAddSectionOpen(false);
					toast({
						title: "Section added",
						description: "Configure it below to customize.",
					});
				},
				onError: () =>
					toast({
						title: "Add failed",
						description: "Could not add section.",
						variant: "destructive",
					}),
			},
		);
	}

	function handleConfirmDelete() {
		if (!deleteTarget) return;
		const id = deleteTarget.id;
		const label = deleteTarget.section_type?.label?.en ?? "Section";
		removeSection(id, {
			onSuccess: () => {
				if (expandedSectionId === id) setExpandedSectionId(null);
				setDeleteTarget(null);
				toast({
					title: "Section deleted",
					description: `"${label}" was removed.`,
				});
			},
			onError: () =>
				toast({
					title: "Delete failed",
					description: "Could not delete section.",
					variant: "destructive",
				}),
		});
	}

	if (isLoading) {
		return (
			<div className="space-y-4">
				<Skeleton className="h-12 w-64 rounded-lg" />
				<Skeleton className="h-24 w-full rounded-xl" />
				<Skeleton className="h-24 w-full rounded-xl" />
			</div>
		);
	}

	if (!layout) {
		// Distinguish auth/transient errors from genuine 404s so the user isn't
		// told the layout is missing when their session has just expired.
		const status = (layoutError as { response?: { status?: number } } | null)
			?.response?.status;
		const isAuthError = status === 401 || status === 403;
		const isNotFound = status === 404;
		const isNetworkError = layoutError && status == null;

		const { title, body } = isAuthError
			? {
					title: "Your session has expired",
					body: "Sign in again to keep editing this layout.",
				}
			: isNotFound
				? {
						title: "Layout not found",
						body: "It may have been deleted, or the link is incorrect.",
					}
				: isNetworkError
					? {
							title: "Couldn't load this layout",
							body: "Check your connection, then try again.",
						}
					: {
							title: "Layout unavailable",
							body: "Something went wrong loading this layout.",
						};

		return (
			<div className="max-w-md mx-auto text-center py-16">
				<h2 className="text-lg font-semibold text-cacao mb-1">{title}</h2>
				<p className="text-sm text-taupe mb-4">{body}</p>
				{onBack && (
					<button
						type="button"
						className="text-amber hover:underline text-sm"
						onClick={onBack}
					>
						Go back to layouts
					</button>
				)}
			</div>
		);
	}

	return (
		<div className="space-y-6">
			{/* Top bar — sticky so Preview/Schedule/Publish stay reachable while
			    scrolling long section forms */}
			<div className="sticky top-0 z-20 -mx-6 px-6 py-3 bg-linen/95 backdrop-blur supports-[backdrop-filter]:bg-linen/80 border-b border-stone-200/60 flex items-start justify-between gap-4">
				<div className="flex items-center gap-3 min-w-0">
					{onBack && (
						<button
							type="button"
							onClick={onBack}
							className="p-1.5 rounded hover:bg-pearl/100 text-taupe hover:text-cacao flex-shrink-0"
							aria-label="Back to layouts"
							title="Back to layouts"
						>
							<ArrowLeft size={18} />
						</button>
					)}
					<div className="min-w-0">
						<div className="flex items-center gap-2 flex-wrap">
							<h1 className="text-xl font-bold text-cacao truncate">
								{layout.title?.en ?? layout.slug}
							</h1>
							<StatusBadge status={layout.status} />
						</div>
						<p className="text-taupe text-xs font-mono truncate">
							{layout.slug}
						</p>
					</div>
				</div>
				<div className="flex items-center gap-2 flex-shrink-0">
					{onPreview && (
						<Button
							variant="outline"
							size="sm"
							onClick={async () => {
								try {
									await onPreview(layoutId);
								} catch {
									toast({
										title: "Preview failed",
										description: "Could not open draft preview.",
										variant: "destructive",
									});
								}
							}}
						>
							Preview
						</Button>
					)}
					<Button
						variant="outline"
						size="sm"
						onClick={() => setScheduleOpen(true)}
					>
						Schedule
					</Button>
					<Button
						size="sm"
						onClick={() => setPublishConfirmOpen(true)}
						disabled={publishing}
					>
						{publishing ? (
							<>
								<Loader2 size={14} className="mr-1.5 animate-spin" />
								Publishing…
							</>
						) : (
							"Publish"
						)}
					</Button>
				</div>
			</div>

			{/* Section list */}
			<div className="space-y-3">
				<div className="flex items-center justify-between">
					<h2 className="text-sm font-semibold text-cacao uppercase tracking-wide">
						Sections ({sections.length})
					</h2>
					<Button
						size="sm"
						variant="outline"
						onClick={() => setAddSectionOpen(true)}
					>
						<Plus size={14} className="mr-1" />
						Add Section
					</Button>
				</div>

				{sections.length === 0 ? (
					<div className="rounded-xl border-2 border-dashed border-gray-200 py-12 text-center text-pearl">
						<p className="text-sm">No sections yet.</p>
						<button
							type="button"
							onClick={() => setAddSectionOpen(true)}
							className="mt-2 text-sm text-amber hover:underline"
						>
							Add your first section
						</button>
					</div>
				) : (
					<DndContext
						sensors={sensors}
						collisionDetection={closestCenter}
						onDragEnd={handleDragEnd}
					>
						<SortableContext
							items={sections.map((s) => s.id)}
							strategy={verticalListSortingStrategy}
						>
							<div className="space-y-2">
								{sections.map((section) => (
									<SortableSectionCard
										key={section.id}
										section={section}
										layoutId={layoutId}
										expanded={expandedSectionId === section.id}
										onToggleExpand={() =>
											setExpandedSectionId((prev) =>
												prev === section.id ? null : section.id,
											)
										}
										onRequestDelete={(s) => setDeleteTarget(s)}
										apiClient={apiClient}
										apiPathPrefix={apiPathPrefix}
										mode={mode}
										s3Client={s3Client}
										vendorId={vendorId}
									/>
								))}
							</div>
						</SortableContext>
					</DndContext>
				)}
			</div>

			{/* Add Section Dialog */}
			<Dialog
				open={addSectionOpen}
				onOpenChange={(open) => {
					setAddSectionOpen(open);
					if (!open) setSectionTypeSearch("");
				}}
			>
				<DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
					<DialogHeader>
						<DialogTitle>Add Section</DialogTitle>
					</DialogHeader>
					{typesLoading ? (
						<div className="grid grid-cols-3 gap-3 py-4">
							{Array.from({ length: 6 }).map((_, i) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton list
								<Skeleton key={i} className="h-20 rounded-lg" />
							))}
						</div>
					) : (
						<>
							<div className="relative">
								<Search
									size={14}
									className="absolute left-3 top-1/2 -translate-y-1/2 text-taupe pointer-events-none"
								/>
								<Input
									value={sectionTypeSearch}
									onChange={(e) => setSectionTypeSearch(e.target.value)}
									placeholder="Search section types…"
									className="pl-9"
									aria-label="Search section types"
								/>
							</div>
							{filteredSectionTypes.length === 0 ? (
								<div className="py-10 text-center text-sm text-taupe">
									No section types match “{sectionTypeSearch}”.
								</div>
							) : (
								<div className="grid grid-cols-2 sm:grid-cols-3 gap-3 py-2">
									{filteredSectionTypes.map((type: SectionType) => {
										const IconCmp = resolveSectionTypeIcon(type.icon);
										return (
											<button
												type="button"
												key={type.id}
												onClick={() => handleAddSection(type.id)}
												disabled={addingSection}
												className="flex flex-col items-center gap-2 p-4 rounded-xl border border-gray-200 hover:border-amber hover:bg-amber/5 transition-colors text-center disabled:opacity-50"
											>
												<div className="w-10 h-10 rounded-lg bg-pearl/60 flex items-center justify-center text-cacao">
													{IconCmp ? (
														<IconCmp size={20} />
													) : (
														<Shapes size={20} />
													)}
												</div>
												<span className="text-sm font-medium text-cacao leading-tight">
													{type.label?.en ?? type.name}
												</span>
											</button>
										);
									})}
								</div>
							)}
						</>
					)}
					<DialogFooter>
						<Button variant="outline" onClick={() => setAddSectionOpen(false)}>
							Cancel
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Schedule Dialog */}
			<Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
				<DialogContent className="max-w-sm">
					<DialogHeader>
						<DialogTitle>Schedule Layout</DialogTitle>
					</DialogHeader>
					<div className="py-2 space-y-3">
						<p className="text-sm text-taupe">
							Choose when this layout should go live.
						</p>
						<div>
							<p className="block text-sm font-medium text-cacao mb-1">
								Publish At
							</p>
							<Input
								type="datetime-local"
								value={publishAt}
								onChange={(e) => setPublishAt(e.target.value)}
							/>
						</div>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setScheduleOpen(false)}>
							Cancel
						</Button>
						<Button
							onClick={handleSchedule}
							disabled={!publishAt || scheduling}
						>
							{scheduling ? "Scheduling…" : "Schedule"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Publish confirmation */}
			<Dialog open={publishConfirmOpen} onOpenChange={setPublishConfirmOpen}>
				<DialogContent className="max-w-sm">
					<DialogHeader>
						<DialogTitle>Publish layout?</DialogTitle>
					</DialogHeader>
					<p className="text-sm text-taupe">
						This will replace the live version immediately and make your draft
						visible to all visitors.
					</p>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setPublishConfirmOpen(false)}
						>
							Cancel
						</Button>
						<Button onClick={handlePublish} disabled={publishing}>
							{publishing ? "Publishing…" : "Publish"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Delete section confirmation */}
			<Dialog
				open={!!deleteTarget}
				onOpenChange={(open) => {
					if (!open) setDeleteTarget(null);
				}}
			>
				<DialogContent className="max-w-sm">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2">
							<AlertCircle size={18} className="text-red-500" />
							Delete section?
						</DialogTitle>
					</DialogHeader>
					<p className="text-sm text-taupe">
						{deleteTarget &&
							`"${deleteTarget.section_type?.label?.en ?? "This section"}" will be removed from the draft. This cannot be undone.`}
					</p>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setDeleteTarget(null)}
							disabled={removing}
						>
							Cancel
						</Button>
						<Button
							onClick={handleConfirmDelete}
							disabled={removing}
							className="bg-red-600 hover:bg-red-700 text-white"
						>
							{removing ? (
								<>
									<Loader2 size={14} className="mr-1.5 animate-spin" />
									Deleting…
								</>
							) : (
								<>
									<Trash2 size={14} className="mr-1.5" />
									Delete
								</>
							)}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
