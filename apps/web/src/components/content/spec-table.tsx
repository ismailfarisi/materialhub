import type { ReactNode } from "react";

/**
 * A reference table set like a mill label: 2px ink top rule, condensed-caps
 * headers, hairline rows. Scrolls sideways inside its own box on a phone.
 * The first column is the row header.
 */
export function SpecTable({
	caption,
	columns,
	rows,
}: {
	caption: string;
	columns: string[];
	rows: ReactNode[][];
}) {
	return (
		<div className="not-prose overflow-x-auto scrollbar-nl -mx-4 px-4 md:mx-0 md:px-0">
			<table className="w-full min-w-[560px] border-collapse border-t-2 border-nl-cacao text-[14px] leading-[1.5]">
				<caption className="sr-only">{caption}</caption>
				<thead>
					<tr>
						{columns.map((c) => (
							<th
								key={c}
								scope="col"
								className="mill-label text-nl-russet text-start font-semibold py-3 pe-4 border-b border-nl-cacao/12 align-bottom"
							>
								{c}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{rows.map((r, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: static rows
						<tr key={i} className="align-top">
							{r.map((cell, j) =>
								j === 0 ? (
									<th
										// biome-ignore lint/suspicious/noArrayIndexKey: static cells
										key={j}
										scope="row"
										className="text-start font-medium text-nl-cacao py-3 pe-4 border-b border-nl-cacao/12"
									>
										{cell}
									</th>
								) : (
									<td
										// biome-ignore lint/suspicious/noArrayIndexKey: static cells
										key={j}
										className="py-3 pe-4 border-b border-nl-cacao/12 text-nl-cacao/85"
									>
										{cell}
									</td>
								),
							)}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
