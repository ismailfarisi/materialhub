"use client";

import { useReel } from "@/lib/queries/reels-studio";
import { Button } from "@materialhub/ui";
import { ArrowLeft } from "@phosphor-icons/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ReelMetadataForm } from "../../_components/reel-metadata-form";

export default function ReelEditPage() {
	const params = useParams<{ reelId: string }>();
	const reelId = params?.reelId ?? "";
	const { data: reel, isLoading, isError } = useReel(reelId);

	if (isLoading) {
		return (
			<div className="flex min-h-64 items-center justify-center">
				<div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
			</div>
		);
	}

	if (isError || !reel) {
		return (
			<div className="space-y-4">
				<Button variant="ghost" size="sm" asChild>
					<Link href="/reels">
						<ArrowLeft size={16} className="mr-2" />
						Back to reels
					</Link>
				</Button>
				<div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
					Reel not found or unavailable.
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<div>
				<Button variant="ghost" size="sm" asChild>
					<Link href="/reels">
						<ArrowLeft size={16} className="mr-2" />
						Back to reels
					</Link>
				</Button>
			</div>
			<div>
				<h1 className="text-2xl font-bold text-gray-900">Edit Reel</h1>
				<p className="text-sm text-gray-500">
					Tag products, set details, and publish
				</p>
			</div>
			<ReelMetadataForm reel={reel} />
		</div>
	);
}
