/** Collection loading state: header and grid shapes on the board. */
function Block({ className }: { className: string }) {
	return (
		<span
			aria-hidden="true"
			className={`block rounded-md bg-nl-cacao/[0.07] ${className}`}
		/>
	);
}

export default function CollectionLoading() {
	return (
		<div
			aria-busy="true"
			className="mx-auto max-w-[1400px] px-4 md:px-8 pb-16 motion-safe:animate-pulse"
		>
			<output className="sr-only">Loading</output>
			<div className="grid gap-5 pt-6 pb-8 md:pt-10 md:pb-10">
				<Block className="h-3.5 w-32" />
				<Block className="h-10 md:h-14 w-[min(560px,80%)]" />
				<Block className="h-4 w-[min(480px,90%)]" />
				<Block className="mt-2 h-2.5 w-full rounded-sm" />
			</div>
			<ul className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4 list-none m-0 p-0">
				{["a", "b", "c", "d", "e", "f", "g", "h"].map((i) => (
					<li
						key={i}
						aria-hidden="true"
						className="rounded-md bg-nl-pearl shadow-card overflow-hidden"
					>
						<span className="block h-7 bg-nl-cacao/[0.12]" />
						<span className="block aspect-square bg-nl-linen" />
						<span className="grid gap-2 p-4">
							<Block className="h-3 w-20" />
							<Block className="h-4 w-full" />
							<Block className="h-4 w-24" />
						</span>
					</li>
				))}
			</ul>
		</div>
	);
}
