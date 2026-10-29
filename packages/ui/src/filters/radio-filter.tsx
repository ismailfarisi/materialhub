import type { FilterRendererProps } from "./types.ts";

export function RadioFilter({
	filter,
	paramValue,
	onChange,
}: FilterRendererProps) {
	function pick(v: string) {
		onChange(paramValue === v ? null : v);
	}

	return (
		<div>
			<h4 className="text-sm font-medium mb-2">{filter.name}</h4>
			<div className="space-y-1">
				{filter.values.map((v) => (
					<label
						key={v.value}
						className="flex items-center gap-2 text-sm cursor-pointer"
					>
						<input
							type="radio"
							name={`filter-${filter.key}`}
							aria-label={v.label}
							checked={paramValue === v.value}
							onChange={() => pick(v.value)}
							onClick={() => paramValue === v.value && pick(v.value)}
						/>
						{v.label}
					</label>
				))}
			</div>
		</div>
	);
}
