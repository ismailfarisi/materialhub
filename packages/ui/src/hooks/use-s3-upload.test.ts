import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
	type S3UploadClient,
	type UploadResult,
	useS3Upload,
} from "./use-s3-upload";

function makeClient(overrides: Partial<S3UploadClient> = {}): S3UploadClient {
	return {
		presign: vi.fn(async () => ({
			uploadUrl: "https://s3/upload",
			key: "products/x/file.png",
		})),
		putToS3: vi.fn(async () => {}),
		processAsset: vi.fn(async () => ({ url: "https://cdn/processed.webp" })),
		...overrides,
	};
}

describe("useS3Upload", () => {
	it("for product_image returns the uploaded key without calling processAsset", async () => {
		const client = makeClient();
		const { result } = renderHook(() =>
			useS3Upload({ assetType: "product_image", client }),
		);
		let out: UploadResult | undefined;
		await act(async () => {
			out = await result.current.upload(
				new File(["x"], "f.png", { type: "image/png" }),
			);
		});
		expect(out).toEqual({ key: "products/x/file.png" });
		expect(client.processAsset).not.toHaveBeenCalled();
	});

	it("for kyc_document returns the key without calling processAsset", async () => {
		const client = makeClient({
			presign: vi.fn(async () => ({
				uploadUrl: "u",
				key: "private/kyc/v/file.pdf",
			})),
		});
		const { result } = renderHook(() =>
			useS3Upload({ assetType: "kyc_document", client }),
		);
		let out: UploadResult | undefined;
		await act(async () => {
			out = await result.current.upload(
				new File(["x"], "x.pdf", { type: "application/pdf" }),
			);
		});
		expect(out).toEqual({ key: "private/kyc/v/file.pdf" });
		expect(client.processAsset).not.toHaveBeenCalled();
	});

	it("for brand_logo calls processAsset and returns the processed URL", async () => {
		const client = makeClient();
		const { result } = renderHook(() =>
			useS3Upload({ assetType: "brand_logo", client }),
		);
		let out: UploadResult | undefined;
		await act(async () => {
			out = await result.current.upload(
				new File(["x"], "logo.png", { type: "image/png" }),
			);
		});
		expect(out).toEqual({ url: "https://cdn/processed.webp" });
		expect(client.processAsset).toHaveBeenCalledWith({
			assetType: "brand_logo",
			key: "products/x/file.png",
		});
	});

	it("flips isUploading during the call", async () => {
		const client = makeClient();
		const { result } = renderHook(() =>
			useS3Upload({ assetType: "brand_logo", client }),
		);
		expect(result.current.isUploading).toBe(false);
		await act(async () => {
			await result.current.upload(
				new File(["x"], "f.png", { type: "image/png" }),
			);
		});
		expect(result.current.isUploading).toBe(false);
	});
});
