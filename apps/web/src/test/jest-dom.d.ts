// jest-dom ships this augmentation in `@testing-library/jest-dom/vitest`, but
// with Bun's isolated installs its `declare module "vitest"` resolves to a
// different vitest copy than this app's, so the matchers never reach our
// `expect`. Declaring it here binds it to the app's own vitest.
import type { TestingLibraryMatchers } from "@testing-library/jest-dom/matchers";

declare module "vitest" {
	// biome-ignore lint/suspicious/noExplicitAny: mirrors jest-dom's own declaration
	interface Assertion<T = any> extends TestingLibraryMatchers<any, T> {}
	// biome-ignore lint/suspicious/noExplicitAny: mirrors jest-dom's own declaration
	interface AsymmetricMatchersContaining extends TestingLibraryMatchers<any, any> {}
}
