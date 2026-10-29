"use client";

import { Eye, EyeOff, GripVertical, Link as LinkIcon } from "lucide-react";
import { useState } from "react";
import type { HeaderNavTab } from "./types";

interface Props {
	tabs: HeaderNavTab[];
	selectedId: string | null;
	onSelect: (id: string) => void;
	onToggleEnabled: (id: string) => void;
	onReorder: (next: HeaderNavTab[]) => void;
}

export function TabList({
	tabs,
	selectedId,
	onSelect,
	onToggleEnabled,
	onReorder,
}: Props) {
	const [draggedId, setDraggedId] = useState<string | null>(null);

	return (
		<ul className="list-none m-0 p-0 divide-y divide-nl-cacao/10">
			{tabs.map((tab) => (
				<li
					key={tab.id}
					draggable
					onDragStart={() => setDraggedId(tab.id)}
					onDragOver={(e) => e.preventDefault()}
					onDrop={() => {
						if (!draggedId || draggedId === tab.id) return;
						const next = [...tabs];
						const fromIdx = next.findIndex((t) => t.id === draggedId);
						const toIdx = next.findIndex((t) => t.id === tab.id);
						const [moved] = next.splice(fromIdx, 1);
						next.splice(toIdx, 0, moved);
						onReorder(next.map((t, i) => ({ ...t, position: i })));
						setDraggedId(null);
					}}
					className={`flex items-center gap-2 px-3 py-2 cursor-pointer ${
						selectedId === tab.id ? "bg-nl-amber/10" : "hover:bg-nl-cacao/5"
					}`}
					onClick={() => onSelect(tab.id)}
					onKeyDown={(e) => {
						if (e.key === "Enter" || e.key === " ") onSelect(tab.id);
					}}
				>
					<GripVertical className="h-4 w-4 text-nl-russet/50 cursor-grab" />
					<span className="flex-1 text-sm text-nl-cacao">{tab.label.en}</span>
					{tab.kind === "custom" && (
						<LinkIcon className="h-3.5 w-3.5 text-nl-russet/60" />
					)}
					<button
						type="button"
						aria-label={tab.enabled ? "Disable tab" : "Enable tab"}
						onClick={(e) => {
							e.stopPropagation();
							onToggleEnabled(tab.id);
						}}
						className="text-nl-russet hover:text-nl-cacao"
					>
						{tab.enabled ? (
							<Eye className="h-4 w-4" />
						) : (
							<EyeOff className="h-4 w-4 opacity-50" />
						)}
					</button>
				</li>
			))}
		</ul>
	);
}
