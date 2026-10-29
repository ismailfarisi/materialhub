import { useEffect, useState } from "react";
import type { FilterRendererProps } from "./types.ts";

export function RangeFilter({
	filter,
	paramValue,
	onChange,
}: FilterRendererProps) {
	const [lo, hi] = (paramValue ?? "").split("-");
	const [minStr, setMinStr] = useState(lo ?? "");
	const [maxStr, setMaxStr] = useState(hi ?? "");

	useEffect(() => {
		const [a, b] = (paramValue ?? "").split("-");
		setMinStr(a ?? "");
		setMaxStr(b ?? "");
	}, [paramValue]);

	function apply() {
		const a = minStr.trim();
		const b = maxStr.trim();
		if (!a && !b) {
			onChange(null);
			return;
		}
		onChange(`${a}-${b}`);
	}

	return (
		<div>
			<h4 className="text-sm font-medium mb-2">{filter.name}</h4>
			<div className="flex items-center gap-2">
				<input
					type="number"
					aria-label={`${filter.name} min`}
					className="w-20 text-sm border rounded px-2 py-1"
					placeholder={filter.min?.toString() ?? "min"}
					value={minStr}
					onChange={(e) => setMinStr(e.target.value)}
				/>
				<span className="text-gray-400">–</span>
				<input
					type="number"
					aria-label={`${filter.name} max`}
					className="w-20 text-sm border rounded px-2 py-1"
					placeholder={filter.max?.toString() ?? "max"}
					value={maxStr}
					onChange={(e) => setMaxStr(e.target.value)}
				/>
				<button
					type="button"
					onClick={apply}
					className="text-xs text-primary underline"
				>
					Apply
				</button>
			</div>
		</div>
	);
}
