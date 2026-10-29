"use client";

import { Check, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AddTabDropdown } from "./add-tab-dropdown";
import {
	useHeaderNavDraft,
	usePublishHeaderNav,
	useUpsertHeaderNavDraft,
} from "./queries";
import { TabEditorPane } from "./tab-editor-pane";
import { TabList } from "./tab-list";
import type { HeaderNavConfig, HeaderNavTab } from "./types";

const EMPTY_CONFIG: HeaderNavConfig = { tabs: [] };

export function HeaderNavEditor() {
	const { data: draft, isLoading } = useHeaderNavDraft();
	const { mutate: upsert, isPending: saving } = useUpsertHeaderNavDraft();
	const { mutate: publish, isPending: publishing } = usePublishHeaderNav();

	const [config, setConfig] = useState<HeaderNavConfig>(EMPTY_CONFIG);
	const [selectedId, setSelectedId] = useState<string | null>(null);

	// Track whether we've hydrated from server yet so we don't auto-save the
	// empty initial state over a user's draft before the GET resolves.
	const [hydrated, setHydrated] = useState(false);

	// Hydrate from the server ONCE on first load. After that, local edits are
	// authoritative — re-running setConfig on every `draft` reference change
	// (e.g. after a save) would overwrite local state and trigger an infinite
	// auto-save loop.
	// `isLoading=true` means the GET is in flight; we wait for it to resolve
	// to either a record or null before marking hydrated, otherwise we'd lock
	// in an empty state before the data ever arrived.
	useEffect(() => {
		if (hydrated) return;
		if (isLoading) return;
		if (draft) {
			setConfig(draft.config);
			if (draft.config.tabs.length > 0) {
				setSelectedId(draft.config.tabs[0].id);
			}
		}
		setHydrated(true);
	}, [draft, hydrated, isLoading]);

	useEffect(() => {
		if (!hydrated) return;
		if (config.tabs.length === 0) return;
		const handle = setTimeout(() => upsert(config), 500);
		return () => clearTimeout(handle);
	}, [config, hydrated, upsert]);

	function handlePublish() {
		// Flush any pending draft synchronously, then publish. Prevents the
		// race where the user clicks Publish before the 500ms debounce fires.
		if (config.tabs.length > 0) {
			upsert(config, { onSuccess: () => publish() });
		} else {
			publish();
		}
	}

	const selectedTab = useMemo(
		() => config.tabs.find((t) => t.id === selectedId) ?? null,
		[config.tabs, selectedId],
	);

	function updateTab(next: HeaderNavTab) {
		setConfig({
			...config,
			tabs: config.tabs.map((t) => (t.id === next.id ? next : t)),
		});
	}

	function toggleEnabled(id: string) {
		setConfig({
			...config,
			tabs: config.tabs.map((t) =>
				t.id === id ? { ...t, enabled: !t.enabled } : t,
			),
		});
	}

	if (isLoading) {
		return (
			<div className="flex items-center justify-center py-20">
				<Loader2 className="h-5 w-5 animate-spin text-nl-russet" />
			</div>
		);
	}

	return (
		<div className="grid grid-cols-[280px_1fr] gap-6 h-[calc(100vh-200px)]">
			<aside className="border border-nl-cacao/10 overflow-y-auto">
				<div className="px-3 py-2 border-b border-nl-cacao/10 flex items-center">
					<span className="text-xs uppercase tracking-[0.18em] text-nl-russet">
						Tabs
					</span>
				</div>
				<TabList
					tabs={config.tabs}
					selectedId={selectedId}
					onSelect={setSelectedId}
					onToggleEnabled={toggleEnabled}
					onReorder={(tabs) => setConfig({ ...config, tabs })}
				/>
				<div className="px-3 py-2 border-t border-nl-cacao/10">
					<AddTabDropdown
						onAdd={(tab) => {
							const newTab = { ...tab, position: config.tabs.length };
							setConfig({ ...config, tabs: [...config.tabs, newTab] });
							setSelectedId(newTab.id);
						}}
						disabled={config.tabs.length >= 11}
					/>
				</div>
			</aside>

			<main className="border border-nl-cacao/10 overflow-y-auto">
				<div className="px-3 py-2 border-b border-nl-cacao/10 flex items-center justify-between gap-3">
					<span
						className="text-sm font-semibold text-nl-cacao"
						aria-label="selected-tab-header"
					>
						{selectedTab
							? `Editing: ${selectedTab.label.en || "(unnamed)"}`
							: "Select a tab"}
					</span>
					<div className="flex items-center gap-3">
						<SaveStatus saving={saving} hasContent={config.tabs.length > 0} />
						<button
							type="button"
							onClick={handlePublish}
							disabled={publishing || saving || config.tabs.length === 0}
							className="bg-nl-cacao text-nl-linen px-4 py-1.5 text-xs uppercase tracking-[0.22em] disabled:opacity-50"
						>
							{publishing ? "Publishing…" : "Publish"}
						</button>
					</div>
				</div>
				{selectedTab && (
					<TabEditorPane tab={selectedTab} onChange={updateTab} />
				)}
			</main>
		</div>
	);
}

function SaveStatus({
	saving,
	hasContent,
}: {
	saving: boolean;
	hasContent: boolean;
}) {
	const [recentlySaved, setRecentlySaved] = useState(false);
	const [wasSaving, setWasSaving] = useState(false);

	useEffect(() => {
		if (saving) {
			setWasSaving(true);
			setRecentlySaved(false);
			return;
		}
		if (wasSaving) {
			setRecentlySaved(true);
			setWasSaving(false);
			const t = setTimeout(() => setRecentlySaved(false), 2500);
			return () => clearTimeout(t);
		}
	}, [saving, wasSaving]);

	if (!hasContent) return null;

	if (saving) {
		return (
			<span className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.18em] text-nl-russet">
				<Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
				Saving…
			</span>
		);
	}
	if (recentlySaved) {
		return (
			<span className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.18em] text-nl-amber">
				<Check className="h-3.5 w-3.5" strokeWidth={2.5} />
				Saved
			</span>
		);
	}
	return (
		<span className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.18em] text-nl-russet/60">
			<Check className="h-3.5 w-3.5" strokeWidth={2} />
			All changes saved
		</span>
	);
}
