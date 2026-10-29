"use client";

import { api } from "@/lib/api";
import { useLayoutPreviewToken } from "@/lib/queries/layouts";
import { s3UploadClient } from "@/lib/s3-upload-client";
import { LayoutEditor, type LayoutEditorMode } from "@materialhub/ui";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const WEB_BASE = process.env.NEXT_PUBLIC_WEB_URL || "http://localhost:3000";

export default function LayoutEditPage() {
	const params = useParams<{ id: string }>();
	const router = useRouter();
	const layoutId = params.id;
	const [mode, setMode] = useState<LayoutEditorMode>("platform");
	const [contextVendorSlug, setContextVendorSlug] = useState<string | null>(
		null,
	);
	const previewToken = useLayoutPreviewToken();

	useEffect(() => {
		let cancelled = false;
		api
			.get(`/admin/layouts/${layoutId}`)
			.then(({ data }) => {
				if (cancelled) return;
				const layout = data.data;
				if (layout.vendor_id !== null || layout.slug === "vendor-default") {
					setMode("vendor");
				}
				setContextVendorSlug(layout.vendor?.slug ?? null);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [layoutId]);

	async function handlePreview(id: string) {
		const { token, layout_slug } = await previewToken.mutateAsync(id);
		const params = new URLSearchParams({ preview_token: token });
		// Vendor-scoped layouts only resolve in vendor storefront context, so
		// route the preview through /vendor/{slug}. For platform layouts use
		// the matching storefront page.
		const path =
			(layout_slug === "vendor-default" || mode === "vendor") &&
			contextVendorSlug
				? `/en/vendor/${contextVendorSlug}`
				: "/en/";
		window.open(
			`${WEB_BASE}${path}?${params.toString()}`,
			"_blank",
			"noopener,noreferrer",
		);
	}

	return (
		<LayoutEditor
			apiClient={api}
			layoutId={layoutId}
			mode={mode}
			apiPathPrefix="/admin/layouts"
			s3Client={s3UploadClient}
			onPreview={handlePreview}
			onBack={() => router.push("/cms/layouts")}
			onPublishSuccess={() => router.refresh()}
		/>
	);
}
