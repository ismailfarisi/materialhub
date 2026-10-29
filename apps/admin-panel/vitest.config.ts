import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [react()],
	test: {
		environment: "jsdom",
		setupFiles: ["./src/test/setup.ts"],
		globals: true,
		// Playwright owns e2e/ and tests/e2e/ and runs via `bunx playwright test`.
		// Without this, Vitest's default include glob collects those .spec.ts
		// files and every one fails with "Playwright Test did not expect
		// test.describe() to be called here."
		exclude: ["**/node_modules/**", "**/dist/**", "e2e/**", "tests/e2e/**"],
	},
	resolve: {
		alias: {
			"@": resolve(__dirname, "./src"),
		},
	},
});
