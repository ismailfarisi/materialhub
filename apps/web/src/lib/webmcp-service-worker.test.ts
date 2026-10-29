import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { registerMaterialHubWebMcpServiceWorker } from "./webmcp";

describe("registerMaterialHubWebMcpServiceWorker", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		Reflect.deleteProperty(navigator, "serviceWorker");
	});

	test("does nothing when service workers are unavailable", async () => {
		await expect(
			registerMaterialHubWebMcpServiceWorker(),
		).resolves.toBeUndefined();
	});

	test("registers the WebMCP service worker at the site root", async () => {
		const registration = { scope: "/" };
		const register = vi.fn().mockResolvedValue(registration);
		Object.defineProperty(navigator, "serviceWorker", {
			configurable: true,
			value: { register },
		});

		await expect(registerMaterialHubWebMcpServiceWorker()).resolves.toBe(
			registration,
		);
		expect(register).toHaveBeenCalledWith("/webmcp-service-worker.js", {
			scope: "/",
		});
	});

	test("swallows registration failures so the storefront can keep running", async () => {
		const register = vi
			.fn()
			.mockRejectedValue(new Error("registration denied"));
		Object.defineProperty(navigator, "serviceWorker", {
			configurable: true,
			value: { register },
		});

		await expect(
			registerMaterialHubWebMcpServiceWorker(),
		).resolves.toBeUndefined();
	});
});

describe("MaterialHub WebMCP service worker assets", () => {
	test("publishes a manifest with service worker installation metadata", () => {
		const manifestPath = resolve(
			__dirname,
			"../../public/manifest.webmanifest",
		);
		const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

		expect(manifest.serviceworker).toEqual({
			src: "/webmcp-service-worker.js",
			scope: "/",
			use_cache: false,
		});
	});

	test("guards service worker tool registration behind the experimental agent API", () => {
		const workerPath = resolve(
			__dirname,
			"../../public/webmcp-service-worker.js",
		);
		const worker = readFileSync(workerPath, "utf8");

		expect(worker).toContain("self.agent");
		expect(worker).toContain("provideContext");
		expect(worker).toContain("materialhub.service.searchProducts");
	});
});
