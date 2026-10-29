export function ProgressBar({
	value,
	max,
}: { value: number; max: number | null }) {
	const pct = max && max > 0 ? Math.round((value / max) * 100) : 0;
	return (
		<div className="flex items-center gap-2">
			<div className="h-2 w-40 overflow-hidden rounded bg-pearl/200">
				<div className="h-full bg-blue-600" style={{ width: `${pct}%` }} />
			</div>
			<span className="text-xs text-taupe">
				{value}
				{max != null ? ` / ${max}` : ""}
			</span>
		</div>
	);
}
