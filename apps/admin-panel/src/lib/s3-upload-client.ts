import type { S3UploadClient } from "@materialhub/ui";
import { api } from "./api";

export const s3UploadClient: S3UploadClient = {
	async presign(input) {
		const { data } = await api.post("/media/presign", {
			asset_type: input.assetType,
			filename: input.filename,
			content_type: input.contentType,
			vendor_id: input.vendorId,
		});
		return { uploadUrl: data.uploadUrl, key: data.key };
	},

	async putToS3(uploadUrl, file, onProgress) {
		await new Promise<void>((resolve, reject) => {
			const xhr = new XMLHttpRequest();
			xhr.open("PUT", uploadUrl);
			xhr.setRequestHeader("Content-Type", file.type);
			xhr.upload.onprogress = (e) => {
				if (e.lengthComputable && onProgress) {
					onProgress(Math.round((e.loaded / e.total) * 100));
				}
			};
			xhr.onload = () =>
				xhr.status >= 200 && xhr.status < 300
					? resolve()
					: reject(new Error(`S3 PUT failed: ${xhr.status}`));
			xhr.onerror = () => reject(new Error("S3 PUT network error"));
			xhr.send(file);
		});
	},

	async processAsset(input) {
		const { data } = await api.post("/media/process-asset", {
			asset_type: input.assetType,
			key: input.key,
		});
		return { url: data.url };
	},

	async presignLayoutVideo(input) {
		const { data } = await api.post("/media/videos/layout/presign", {
			filename: input.filename,
			content_type: input.contentType,
			size_bytes: input.sizeBytes,
		});
		return { uploadUrl: data.url, key: data.key };
	},

	async processLayoutVideo(input) {
		const { data } = await api.post("/media/videos/layout/process", { key: input.key });
		return { id: data.video.id, status: data.video.status };
	},

	async getLayoutVideo(id) {
		const { data } = await api.get(`/media/videos/layout/${id}`);
		return data;
	},

	async deleteLayoutVideo(id) {
		await api.delete(`/media/videos/layout/${id}`);
	},
};
