import { describe, expect, test } from "bun:test";
import { STORAGE_UNAVAILABLE, uploadErrorMessage } from "./upload-error";

describe("uploadErrorMessage", () => {
	test("keeps an API error message", () => {
		expect(
			uploadErrorMessage({ response: { data: { message: "File type not allowed" } } }),
		).toBe("File type not allowed");
	});

	test("turns raw storage / network errors into one plain sentence", () => {
		for (const m of [
			"S3 PUT failed: 403",
			"S3 PUT network error",
			"upload failed: 500",
			"Network Error",
			"Failed to fetch",
			"Request failed with status code 502",
		]) {
			expect(uploadErrorMessage(new Error(m))).toBe(STORAGE_UNAVAILABLE);
		}
		expect(uploadErrorMessage(undefined)).toBe(STORAGE_UNAVAILABLE);
	});

	test("passes other readable errors through", () => {
		expect(uploadErrorMessage(new Error("File is larger than 10 MB"))).toBe(
			"File is larger than 10 MB",
		);
	});
});
