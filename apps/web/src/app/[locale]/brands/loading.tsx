export default function BrandsLoading() {
	return (
		<div
			className="mx-auto max-w-[1400px] px-4 pb-16 md:px-8"
			aria-busy="true"
			aria-live="polite"
		>
			<div className="animate-pulse motion-reduce:animate-none">
				<div className="grid gap-3 pt-2 pb-6 md:pb-8">
					<div className="flex h-11 items-center gap-2.5">
						<div className="h-3 w-12 rounded-sm bg-nl-cacao/[0.08]" />
						<div className="h-3 w-16 rounded-sm bg-nl-cacao/[0.08]" />
					</div>
					<div className="h-14 w-64 rounded-sm bg-nl-cacao/[0.09]" />
					<div className="h-4 w-96 max-w-full rounded-sm bg-nl-cacao/[0.06]" />
				</div>
				<div className="mb-8 h-[54px] border-y border-nl-cacao/12" />
				<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:ms-[96px] md:gap-4 lg:grid-cols-4 xl:grid-cols-5">
					{Array.from({ length: 10 }, (_, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
						<div key={i} className="overflow-hidden rounded-md bg-nl-pearl shadow-card">
							<div className="aspect-[16/9] bg-nl-linen" />
							<div className="grid gap-2 p-3.5">
								<div className="h-4 w-3/4 rounded-sm bg-nl-cacao/[0.09]" />
								<div className="h-3 w-1/3 rounded-sm bg-nl-cacao/[0.06]" />
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
