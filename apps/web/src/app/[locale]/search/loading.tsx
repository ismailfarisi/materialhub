import { ListingBodySkeleton } from "@/components/product/listing-skeleton";

export default function SearchLoading() {
	return (
		<div
			className="mx-auto max-w-[1400px] px-4 pb-4 md:px-8"
			aria-busy="true"
			aria-live="polite"
		>
			<div className="animate-pulse pt-2 pb-6 motion-reduce:animate-none md:pb-8">
				<div className="flex h-11 items-center gap-2.5">
					<div className="h-3 w-12 rounded-sm bg-nl-cacao/[0.08]" />
					<div className="h-3 w-16 rounded-sm bg-nl-cacao/[0.08]" />
				</div>
				<div className="mt-1 h-9 w-72 max-w-full rounded-sm bg-nl-cacao/[0.09]" />
			</div>
			<ListingBodySkeleton wide />
		</div>
	);
}
