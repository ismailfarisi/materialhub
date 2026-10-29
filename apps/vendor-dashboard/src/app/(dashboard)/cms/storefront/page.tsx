"use client";

import { api } from "@/lib/api";
import { useVendorProfile } from "@/lib/queries/settings";
import {
	useInitStorefront,
	useMyStorefront,
	useStorefrontPreviewToken,
} from "@/lib/queries/storefront";
import { s3UploadClient } from "@/lib/s3-upload-client";
import { LayoutEditor } from "@materialhub/ui";
import { useEffect, useState } from "react";

const WEB_BASE = process.env.NEXT_PUBLIC_WEB_URL || "http://localhost:3000";

export default function VendorStorefrontPage() {
	const init = useInitStorefront();
	const me = useMyStorefront();
	const profile = useVendorProfile();
	const previewToken = useStorefrontPreviewToken();
	const [layoutId, setLayoutId] = useState<string | null>(null);

	// Once /me query settles, kick off init if no layout yet — exactly once.
	useEffect(() => {
		if (me.isLoading) return;
		if (me.data) {
			setLayoutId(me.data.id);
			return;
		}
		if (init.isPending || init.data) return;
		init.mutate(undefined, {
			onSuccess: (r) => setLayoutId(r.layout_id),
		});
	}, [me.isLoading, me.data, init]);

	if (me.isLoading || (!layoutId && (init.isPending || !init.isError))) {
		return (
			<div className="p-8 text-center text-muted-foreground">
				Setting up your storefront…
			</div>
		);
	}

	if (init.isError && !layoutId) {
		return (
			<div className="p-8 text-center text-red-600">
				Failed to set up storefront. Please refresh the page.
			</div>
		);
	}

	if (!layoutId) return null;

	const isUnpublished = me.data?.published_version_id == null;
	const vendorSlug = profile.data?.slug as string | undefined;
	const vendorIdForUpload = profile.data?.id as string | undefined;

	async function handlePreview(id: string) {
		if (!vendorSlug) {
			throw new Error("Vendor profile not loaded");
		}
		const { token } = await previewToken.mutateAsync(id);
		const url = `${WEB_BASE}/en/vendor/${vendorSlug}?preview_token=${encodeURIComponent(token)}`;
		window.open(url, "_blank", "noopener,noreferrer");
	}

	return (
		<div className="space-y-4 p-6">
			<header className="flex items-center justify-between">
				<h1 className="text-2xl font-semibold">Storefront</h1>
			</header>

			{isUnpublished && (
				<div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
					Your storefront is based on the platform template. Edit any section to
					make it yours. Customers see the template until you publish your first
					version.
				</div>
			)}

			<LayoutEditor
				apiClient={api}
				layoutId={layoutId}
				mode="vendor"
				apiPathPrefix="/vendor-layouts"
				s3Client={s3UploadClient}
				vendorId={vendorIdForUpload}
				onPreview={handlePreview}
			/>
		</div>
	);
}
