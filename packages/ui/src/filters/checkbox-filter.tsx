import type { FilterRendererProps } from "./types.ts";

export function CheckboxFilter({
	filter,
	paramValue,
	onChange,
}: FilterRendererProps) {
	const selected = new Set(paramValue?.split(",").filter(Boolean) ?? []);

	function toggle(v: string) {
		if (selected.has(v)) selected.delete(v);
		else selected.add(v);
		const arr = [...selected];
		onChange(arr.length ? arr.join(",") : null);
	}

	return (
		<div>
			<h4 className="text-sm font-medium mb-2">{filter.name}</h4>
			<div className="space-y-1 max-h-40 overflow-y-auto">
				{filter.values.map((v) => (
					<label key={v.value} className="flex items-center gap-2 text-sm">
						<input
							type="checkbox"
							aria-label={v.label}
							checked={selected.has(v.value)}
							onChange={() => toggle(v.value)}
						/>
						{v.label}
						{typeof v.count === "number" && (
							<span className="text-xs text-gray-400">({v.count})</span>
						)}
					</label>
				))}
			</div>
		</div>
	);
}
