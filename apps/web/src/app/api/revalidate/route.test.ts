import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const revalidateTag = vi.fn();
vi.mock("next/cache", () => ({ revalidateTag: (...a: unknown[]) => revalidateTag(...a) }));

import { acceptedRevalidateTags } from "@/lib/revalidate-tags";
import { POST } from "./route";

function post(body: unknown, secret?: string) {
	return POST(
		new Request("http://localhost/api/revalidate", {
			method: "POST",
			headers: { "content-type": "application/json", ...(secret ? { "x-revalidate-secret": secret } : {}) },
			body: JSON.stringify(body),
		}),
	);
}

describe("POST /api/revalidate", () => {
	beforeEach(() => {
		revalidateTag.mockReset();
		vi.stubEnv("REVALIDATE_SECRET", "s3cret");
	});
	afterEach(() => vi.unstubAllEnvs());

	it("expires each allowed tag immediately", async () => {
		const res = await post({ tags: ["cms-page:shipping-guide", "cms-pages", "cms-pages"] }, "s3cret");
		expect(res.status).toBe(200);
		expect(revalidateTag.mock.calls).toEqual([
			["cms-page:shipping-guide", { expire: 0 }],
			["cms-pages", { expire: 0 }],
		]);
	});

	it("rejects a wrong or missing secret", async () => {
		expect((await post({ tags: ["categories"] }, "nope")).status).toBe(401);
		expect((await post({ tags: ["categories"] })).status).toBe(401);
		expect(revalidateTag).not.toHaveBeenCalled();
	});

	it("is closed when no secret is configured", async () => {
		vi.stubEnv("REVALIDATE_SECRET", "");
		expect((await post({ tags: ["categories"] }, "")).status).toBe(401);
	});

	it("rejects tags the storefront doesn't use", async () => {
		expect((await post({ tags: ["products"] }, "s3cret")).status).toBe(400);
		expect((await post({ tags: [] }, "s3cret")).status).toBe(400);
		expect(revalidateTag).not.toHaveBeenCalled();
	});
});

describe("acceptedRevalidateTags", () => {
	it("accepts page, category, tree and header tags", () => {
		expect(
			acceptedRevalidateTags({ tags: ["category:kraft-paper", "categories", "header-navigation", "cms-page:about/team"] }),
		).toEqual(["category:kraft-paper", "categories", "header-navigation", "cms-page:about/team"]);
	});
	it("rejects anything else", () => {
		expect(acceptedRevalidateTags({ tags: ["category:"] })).toBeNull();
		expect(acceptedRevalidateTags({ tags: ["category:Kraft Paper"] })).toBeNull();
		expect(acceptedRevalidateTags({ tags: [1] })).toBeNull();
		expect(acceptedRevalidateTags(null)).toBeNull();
		expect(acceptedRevalidateTags({ tags: Array.from({ length: 51 }, () => "categories") })).toBeNull();
	});
});
