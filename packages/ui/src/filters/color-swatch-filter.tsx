import type { FilterRendererProps } from "./types.ts";

export function ColorSwatchFilter({
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
			<div className="flex flex-wrap gap-2">
				{filter.values.map((v) => {
					const isSelected = selected.has(v.value);
					const bg = v.color_hex
						? { backgroundColor: v.color_hex }
						: v.swatch_image_url
							? {
									backgroundImage: `url(${v.swatch_image_url})`,
									backgroundSize: "cover",
								}
							: { backgroundColor: "#e5e7eb" };
					return (
						<button
							key={v.value}
							type="button"
							aria-label={v.label}
							aria-pressed={isSelected}
							onClick={() => toggle(v.value)}
							className={`w-8 h-8 rounded-full border-2 ${
								isSelected ? "border-primary" : "border-gray-200"
							}`}
							style={bg}
							title={v.label}
						/>
					);
				})}
			</div>
		</div>
	);
}
