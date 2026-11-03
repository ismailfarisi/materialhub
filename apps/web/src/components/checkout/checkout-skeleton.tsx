const block = "rounded-sm bg-nl-cacao/[0.07]";
const PANELS = [
	{ id: "address", rows: ["a1", "a2"] },
	{ id: "delivery", rows: ["d1", "d2"] },
	{ id: "payment", rows: ["p1", "p2", "p3"] },
];

/** Loading skeleton matching the checkout layout: three step panels + summary. */
export function CheckoutSkeleton() {
	return (
		<div
			className="mx-auto max-w-[1400px] px-4 pb-16 pt-6 md:px-8 md:pt-8 animate-pulse motion-reduce:animate-none"
			aria-hidden="true"
		>
			<div className="flex flex-wrap items-center justify-between gap-4">
				<div className={`h-8 w-36 ${block}`} />
				<div className={`h-6 w-64 ${block}`} />
			</div>
			<div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-8">
				<div className="grid gap-4">
					{PANELS.map((panel) => (
						<div key={panel.id} className="grid gap-4 rounded-md bg-nl-pearl p-4 shadow-card sm:p-6">
							<div className="flex items-center gap-3">
								<div className="h-6 w-6 rounded-sm bg-nl-cacao/[0.07]" />
								<div className={`h-5 w-40 ${block}`} />
							</div>
							{panel.rows.map((row) => (
								<div key={row} className="h-14 rounded-md bg-nl-cacao/[0.05]" />
							))}
						</div>
					))}
				</div>
				<div className="hidden gap-4 rounded-md bg-nl-pearl p-6 shadow-card lg:grid">
					<div className={`h-5 w-32 ${block}`} />
					{[0, 1].map((i) => (
						<div key={i} className="grid grid-cols-[56px_1fr] gap-3">
							<div className="aspect-square rounded-md bg-nl-cacao/[0.07]" />
							<div className="grid content-start gap-2 pt-1">
								<div className={`h-4 w-3/4 ${block}`} />
								<div className={`h-3 w-1/3 ${block}`} />
							</div>
						</div>
					))}
					<div className={`h-4 w-full ${block}`} />
					<div className={`h-4 w-full ${block}`} />
					<div className={`h-7 w-full ${block}`} />
					<div className="h-12 w-full rounded-md bg-nl-cacao/[0.07]" />
				</div>
			</div>
		</div>
	);
}
