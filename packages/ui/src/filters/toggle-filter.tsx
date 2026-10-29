import type { FilterRendererProps } from "./types.ts";

export function ToggleFilter({
	filter,
	paramValue,
	onChange,
}: FilterRendererProps) {
	const isOn = paramValue === "true";
	return (
		<button
			type="button"
			aria-pressed={isOn}
			onClick={() => onChange(isOn ? null : "true")}
			className={`px-3 py-1 rounded-full text-sm border ${
				isOn
					? "bg-primary text-white border-primary"
					: "bg-white text-gray-700 border-gray-300"
			}`}
		>
			{filter.name}
		</button>
	);
}
