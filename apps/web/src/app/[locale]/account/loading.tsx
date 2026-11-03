import { ListSkeleton, Skeleton } from "@/components/account/account-ui";

export default function AccountLoading() {
	return (
		<div className="grid gap-6">
			<Skeleton className="h-8 w-48" />
			<ListSkeleton rows={4} />
		</div>
	);
}
