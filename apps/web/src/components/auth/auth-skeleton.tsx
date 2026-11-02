import { Skeleton } from "@/components/account/account-ui";

/** Loading frame matching AuthShell, so the page does not jump on hydrate. */
export function AuthSkeleton({ fields = 1 }: { fields?: number }) {
	return (
		<div className="bg-nl-linen">
			<div className="mx-auto grid max-w-[1400px] items-center gap-10 px-4 py-8 md:px-8 md:py-14 lg:min-h-[calc(100dvh-180px)] lg:grid-cols-[minmax(0,480px)_minmax(0,1fr)] lg:gap-16 xl:gap-24">
				<div className="mx-auto grid w-full max-w-[480px] gap-5 rounded-md bg-nl-pearl p-5 shadow-card sm:p-8">
					<Skeleton className="h-8 w-40" />
					<Skeleton className="h-4 w-3/4" />
					<Skeleton className="h-12 w-full rounded-md" />
					{Array.from({ length: fields }, (_, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
						<div key={i} className="grid gap-2">
							<Skeleton className="h-3.5 w-24" />
							<Skeleton className="h-12 w-full rounded-md" />
						</div>
					))}
					<Skeleton className="h-12 w-full rounded-md" />
				</div>
				<Skeleton className="hidden aspect-[4/3] max-w-[460px] rounded-md lg:block" />
			</div>
		</div>
	);
}
