import { ProductGridSkeleton } from "@/components/product/listing-skeleton";

export default function VendorLoading() {
	return (
		<div
			className="mx-auto max-w-[1400px] px-4 pt-4 pb-12 md:px-8 md:pt-6"
			aria-busy="true"
			aria-live="polite"
		>
			<div className="animate-pulse motion-reduce:animate-none">
				<div className="aspect-[16/7] w-full rounded-md bg-nl-cacao/[0.08] sm:aspect-[16/5] md:max-h-[300px]" />
				<div className="relative mx-2 -mt-6 grid gap-6 rounded-md bg-nl-pearl p-5 shadow-card md:mx-8 md:-mt-14 md:grid-cols-[1fr_320px] md:p-8">
					<div className="flex gap-4 md:gap-6">
						<div className="h-16 w-16 rounded-md bg-nl-linen md:h-24 md:w-24" />
						<div className="grid flex-1 content-start gap-3">
							<div className="h-9 w-1/2 rounded-sm bg-nl-cacao/[0.09]" />
							<div className="h-4 w-3/4 rounded-sm bg-nl-cacao/[0.06]" />
						</div>
					</div>
					<div className="h-24 rounded-sm bg-nl-linen" />
				</div>
				<div className="mt-12 mb-4 h-7 w-56 rounded-sm bg-nl-cacao/[0.09]" />
			</div>
			<ProductGridSkeleton count={5} />
		</div>
	);
}
