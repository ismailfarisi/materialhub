"use client";

import { Button } from "@materialhub/ui";
import { ArrowLeft } from "@phosphor-icons/react";
import Link from "next/link";
import { ReelUploadForm } from "../_components/reel-upload-form";

export default function ReelUploadPage() {
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
				<h1 className="text-2xl font-bold text-gray-900">New Reel</h1>
				<p className="text-sm text-gray-500">
					Upload a short vertical video for your storefront content
				</p>
			</div>
			<ReelUploadForm />
		</div>
	);
}
