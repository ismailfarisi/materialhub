"use client";

import { api } from "@/lib/api";
import { useVendorProfile } from "@/lib/queries/settings";
import {
	useInitStorefront,
	useMyStorefront,
	useStorefrontPreviewToken,
} from "@/lib/queries/storefront";
import { s3UploadClient } from "@/lib/s3-upload-client";
import { WEB_URL } from "@/lib/urls";
import { Button, LayoutEditor } from "@materialhub/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

/** HTTP status of a failed request, if any. */
function statusOf(err: unknown): number | undefined {
	return (err as { response?: { status?: number } } | null)?.response?.status;
}

export default function VendorStorefrontPage() {
	const init = useInitStorefront();
	const me = useMyStorefront();
	const profile = useVendorProfile();
	const previewToken = useStorefrontPreviewToken();
	const queryClient = useQueryClient();
	const [layoutId, setLayoutId] = useState<string | null>(null);
	// Auto-create the storefront at most once per visit. A failed init (a 4xx
	// such as a missing permission, or a 5xx) must not re-fire on every render.
	const initAttempted = useRef(false);

	useEffect(() => {
		if (me.isLoading) return;
		if (me.data) {
			setLayoutId(me.data.id);
			return;
		}
		// /me failed for a reason other than "no storefront yet": don't init.
		if (me.isError) return;
		if (initAttempted.current) return;
		initAttempted.current = true;
		init.mutate(undefined, {
			onSuccess: (r) => setLayoutId(r.layout_id),
		});
	}, [me.isLoading, me.data, me.isError, init]);

	if (me.isLoading || (!layoutId && !me.isError && !init.isError)) {
		return (
			<div className="p-8 text-center text-muted-foreground">
				Setting up your storefront…
			</div>
		);
	}

	if (!layoutId && (init.isError || me.isError)) {
		const err = init.error ?? me.error;
		const status = statusOf(err);
		const message =
			status === 403
				? "Your role can't set up the storefront. Ask the store owner or a manager."
				: ((err as { response?: { data?: { message?: string } } } | null)?.response?.data
						?.message ?? "Failed to set up the storefront.");
		const retryable = status === undefined || status >= 500;
		return (
			<div className="space-y-3 p-8 text-center">
				<p role="alert" className="text-red-600">
					{message}
				</p>
				{retryable ? (
					<Button
						type="button"
						variant="outline"
						disabled={init.isPending}
						onClick={() => {
							if (me.isError) {
								void me.refetch();
								initAttempted.current = false;
								return;
							}
							init.mutate(undefined, { onSuccess: (r) => setLayoutId(r.layout_id) });
						}}
					>
						{init.isPending ? "Trying…" : "Try again"}
					</Button>
				) : null}
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
		const url = `${WEB_URL}/en/vendor/${vendorSlug}?preview_token=${encodeURIComponent(token)}`;
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
				onPublishSuccess={() => {
					// Clears the "customers see the template" banner.
					void queryClient.invalidateQueries({ queryKey: ["my-storefront"] });
				}}
			/>
		</div>
	);
}
