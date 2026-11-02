/**
 * Product detail skeleton: the same two-column frame as the loaded page
 * (photo card beside the purchase panel at lg), so nothing jumps on arrival.
 */
export default function ProductLoading() {
	const bar = "rounded-sm bg-nl-cacao/[0.08]";
	return (
		<div className="min-h-screen bg-nl-linen" aria-busy="true" aria-live="polite">
			<span className="sr-only">Loading</span>
			<div className="mx-auto max-w-[1400px] animate-pulse px-4 pb-16 motion-reduce:animate-none md:px-8">
				<div className="flex items-center gap-2 py-4">
					<span className={`h-3 w-12 ${bar}`} />
					<span className={`h-3 w-24 ${bar}`} />
					<span className={`h-3 w-40 ${bar}`} />
				</div>

				<div className="mt-1 grid gap-6 lg:mt-3 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-12 xl:gap-16">
					<div className="grid gap-3">
						<div className="aspect-square rounded-md bg-nl-pearl shadow-card" />
						<div className="flex gap-2">
							{[0, 1, 2, 3].map((i) => (
								<span key={i} className="h-16 w-16 rounded-sm bg-nl-pearl shadow-card" />
							))}
						</div>
					</div>

					<div className="grid content-start gap-6">
						<div className="grid gap-3">
							<span className={`h-8 w-4/5 ${bar}`} />
							<span className={`h-8 w-1/2 ${bar}`} />
							<span className={`h-3.5 w-2/3 ${bar}`} />
						</div>
						<span className={`h-8 w-40 ${bar}`} />
						<div className="grid border-t-2 border-nl-cacao/20">
							{[0, 1, 2, 3, 4, 5].map((i) => (
								<div key={i} className="flex justify-between border-b border-nl-cacao/10 py-3">
									<span className={`h-3 w-20 ${bar}`} />
									<span className={`h-3 w-24 ${bar}`} />
								</div>
							))}
						</div>
						<div className="flex gap-2">
							{[0, 1, 2].map((i) => (
								<span key={i} className="h-10 w-20 rounded-sm bg-nl-pearl shadow-card" />
							))}
						</div>
						<div className="flex gap-2">
							<span className="h-12 w-[124px] rounded-md bg-nl-pearl shadow-card" />
							<span className="h-12 flex-1 rounded-md bg-nl-amber/25" />
							<span className="h-12 w-12 rounded-md bg-nl-pearl shadow-card" />
						</div>
						<div className="overflow-hidden rounded-md bg-nl-pearl shadow-card">
							<div className="h-7 bg-nl-cacao/10" />
							<div className="flex gap-3 p-4">
								<span className={`h-12 w-12 ${bar}`} />
								<div className="grid flex-1 content-center gap-2">
									<span className={`h-3 w-16 ${bar}`} />
									<span className={`h-4 w-40 ${bar}`} />
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
