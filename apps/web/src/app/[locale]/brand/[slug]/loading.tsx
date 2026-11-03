import { ListingBodySkeleton } from "@/components/product/listing-skeleton";

export default function BrandLoading() {
	return (
		<div
			className="mx-auto max-w-[1400px] px-4 pb-4 md:px-8"
			aria-busy="true"
			aria-live="polite"
		>
			<div className="animate-pulse pt-2 pb-6 motion-reduce:animate-none md:pb-8">
				<div className="flex h-11 items-center gap-2.5">
					<div className="h-3 w-12 rounded-sm bg-nl-cacao/[0.08]" />
					<div className="h-3 w-24 rounded-sm bg-nl-cacao/[0.08]" />
				</div>
				<div className="mt-1 grid gap-6 rounded-md bg-nl-pearl p-5 shadow-card md:grid-cols-[1fr_320px] md:p-8">
					<div className="flex gap-4 md:gap-6">
						<div className="h-16 w-16 rounded-md bg-nl-linen md:h-24 md:w-24" />
						<div className="grid flex-1 content-start gap-3">
							<div className="h-9 w-1/2 rounded-sm bg-nl-cacao/[0.09]" />
							<div className="h-4 w-3/4 rounded-sm bg-nl-cacao/[0.06]" />
						</div>
					</div>
					<div className="h-24 rounded-sm bg-nl-linen" />
				</div>
			</div>
			<ListingBodySkeleton />
		</div>
	);
}
