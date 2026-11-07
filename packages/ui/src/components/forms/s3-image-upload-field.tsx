"use client";

import {
	type MediaAssetType,
	type S3UploadClient,
	useS3Upload,
} from "../../hooks/use-s3-upload";
import { useState } from "react";
import { mediaErrorMessage } from "../products/media-manager/MediaManager";
import { ImageUploader } from "./image-uploader";

export interface S3ImageUploadFieldProps {
	assetType: Exclude<MediaAssetType, "product_image" | "kyc_document">;
	value: string | null;
	onChange: (url: string | null) => void;
	client: S3UploadClient;
	vendorId?: string;
	label?: string;
}

export function S3ImageUploadField({
	assetType,
	value,
	onChange,
	client,
	vendorId,
	label,
}: S3ImageUploadFieldProps) {
	const { upload, isUploading } = useS3Upload({ assetType, client, vendorId });
	const [error, setError] = useState<string | null>(null);

	const images = value ? [{ id: "current", url: value }] : [];

	return (
		<div className="space-y-2">
			{label && <p className="text-sm font-medium">{label}</p>}
			<ImageUploader
				images={images}
				onUpload={async (files) => {
					const file = files[0];
					if (!file) return;
					setError(null);
					try {
						const result = await upload(file);
						if ("url" in result) onChange(result.url);
					} catch (err) {
						setError(mediaErrorMessage(err));
					}
				}}
				onRemove={() => onChange(null)}
				onReorder={() => {}}
				maxImages={1}
				isUploading={isUploading}
			/>
			{error ? (
				<p role="alert" className="text-xs text-destructive">
					{error}
				</p>
			) : null}
		</div>
	);
}
