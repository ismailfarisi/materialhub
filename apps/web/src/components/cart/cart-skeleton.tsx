const block = "rounded-sm bg-nl-cacao/[0.07]";

/** Loading skeleton matching the cart page layout (supplier panels + summary). */
export function CartSkeleton() {
	return (
		<div
			className="mx-auto max-w-[1400px] px-4 py-8 md:px-8 md:py-10 animate-pulse motion-reduce:animate-none"
			aria-hidden="true"
		>
			<div className={`h-8 w-28 ${block}`} />
			<div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-8">
				<div className="grid content-start gap-4">
					{[0, 1].map((g) => (
						<div key={g} className="rounded-md bg-nl-pearl shadow-card">
							<div className="border-b border-nl-cacao/10 px-4 py-4 sm:px-6">
								<div className={`h-4 w-40 ${block}`} />
							</div>
							{[0, 1].map((i) => (
								<div key={i} className="grid grid-cols-[72px_1fr] gap-3 px-4 py-5 sm:grid-cols-[88px_1fr] sm:gap-4 sm:px-6">
									<div className="aspect-square rounded-md bg-nl-cacao/[0.07]" />
									<div className="grid content-start gap-2.5 pt-1">
										<div className={`h-4 w-3/4 ${block}`} />
										<div className={`h-3.5 w-1/4 ${block}`} />
										<div className="flex gap-1.5">
											<div className={`h-6 w-16 ${block}`} />
											<div className={`h-6 w-20 ${block}`} />
										</div>
										<div className="h-10 w-32 rounded-md bg-nl-cacao/[0.07]" />
									</div>
								</div>
							))}
						</div>
					))}
				</div>
				<div className="grid content-start gap-4 rounded-md bg-nl-pearl p-5 shadow-card sm:p-6">
					<div className={`h-5 w-32 ${block}`} />
					<div className={`h-1 w-full ${block}`} />
					<div className={`h-4 w-full ${block}`} />
					<div className={`h-4 w-full ${block}`} />
					<div className={`h-7 w-full ${block}`} />
					<div className="h-12 w-full rounded-md bg-nl-cacao/[0.07]" />
				</div>
			</div>
		</div>
	);
}
