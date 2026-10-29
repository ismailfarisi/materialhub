export function ImageProgressCell({
	total,
	processed,
	failed,
}: {
	total: number;
	processed: number;
	failed: number;
}) {
	if (total === 0) return <span className="text-xs text-taupe">—</span>;
	return (
		<div className="text-xs">
			<span>
				{processed}/{total}
			</span>
			{failed > 0 && (
				<span className="ml-2 text-red-600">({failed} failed)</span>
			)}
		</div>
	);
}
