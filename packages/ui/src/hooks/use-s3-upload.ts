"use client";

import { useCallback, useState } from "react";

export type MediaAssetType =
	| "product_image"
	| "product_video"
	| "brand_logo"
	| "banner_image"
	| "vendor_logo"
	| "vendor_banner"
	| "kyc_document"
	| "category_image"
	| "category_icon"
	| "category_banner";

export type UploadResult = { key: string } | { url: string };

export interface PresignResponse {
	uploadUrl: string;
	key: string;
}

export type LayoutVideoStatus = "processing" | "ready" | "failed";

export interface LayoutVideo {
	id: string;
	status: LayoutVideoStatus;
	url: string;
	poster_url: string;
	duration_seconds: number;
}

/** What actually gets persisted into a layout block's `data.video`. */
export interface LayoutBlockVideo {
	id: string;
	url: string;
	poster_url: string;
	duration_seconds: number;
}

export interface S3UploadClient {
	presign(input: {
		assetType: MediaAssetType;
		filename: string;
		contentType: string;
		vendorId?: string;
	}): Promise<PresignResponse>;
	putToS3(
		uploadUrl: string,
		file: File,
		onProgress?: (pct: number) => void,
	): Promise<void>;
	processAsset(input: { assetType: MediaAssetType; key: string }): Promise<{
		url: string;
	}>;
	presignLayoutVideo?(input: {
		filename: string;
		contentType: string;
		sizeBytes: number;
	}): Promise<PresignResponse>;
	processLayoutVideo?(input: { key: string }): Promise<{ id: string; status: LayoutVideoStatus }>;
	getLayoutVideo?(id: string): Promise<LayoutVideo>;
	deleteLayoutVideo?(id: string): Promise<void>;
}

export function useS3Upload(opts: {
	assetType: MediaAssetType;
	vendorId?: string;
	client: S3UploadClient;
}) {
	const [isUploading, setIsUploading] = useState(false);
	const [progress, setProgress] = useState(0);

	const upload = useCallback(
		async (file: File): Promise<UploadResult> => {
			setIsUploading(true);
			setProgress(0);
			try {
				const { uploadUrl, key } = await opts.client.presign({
					assetType: opts.assetType,
					filename: file.name,
					contentType: file.type,
					vendorId: opts.vendorId,
				});

				await opts.client.putToS3(uploadUrl, file, setProgress);

				if (
					opts.assetType === "product_image" ||
					opts.assetType === "kyc_document"
				) {
					return { key };
				}
				const { url } = await opts.client.processAsset({
					assetType: opts.assetType,
					key,
				});
				return { url };
			} finally {
				setIsUploading(false);
				setProgress(0);
			}
		},
		[opts.client, opts.assetType, opts.vendorId],
	);

	return { upload, isUploading, progress };
}
