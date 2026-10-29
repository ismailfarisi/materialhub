import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("axios", () => ({ default: { get: vi.fn() } }));
vi.mock("@/lib/api-public", () => ({ publicGet: vi.fn() }));

import axios from "axios";
import { GET } from "./route";

// On the prod frontend box, Next's standalone server builds request.url from
// HOSTNAME/PORT (http://0.0.0.0:4000); Caddy passes the public host in headers.
function boxRequest(path: string) {
	return new Request(`http://0.0.0.0:4000${path}`, {
		headers: {
			host: "materialhubuae.com",
			"x-forwarded-host": "materialhubuae.com",
			"x-forwarded-proto": "https",
		},
	});
}

describe("GET /[locale]/a/[slug]", () => {
	beforeEach(() => {
		vi.mocked(axios.get).mockReset();
	});

	it("redirects unknown slugs to the public locale home, not the bind address", async () => {
		vi.mocked(axios.get).mockRejectedValue(new Error("404"));
		const res = await GET(boxRequest("/en/a/nope"), {
			params: Promise.resolve({ locale: "en", slug: "nope" }),
		});
		expect(res.headers.get("location")).toBe("https://materialhubuae.com/en");
	});

	it("redirects resolved store links to the public host with the aff code", async () => {
		vi.mocked(axios.get).mockResolvedValue({
			data: {
				data: {
					code: "ABC",
					targetType: "store",
					targetId: null,
					targetUrl: null,
					vendorId: "v1",
				},
			},
		});
		const res = await GET(boxRequest("/ar/a/abc"), {
			params: Promise.resolve({ locale: "ar", slug: "abc" }),
		});
		expect(res.headers.get("location")).toBe(
			"https://materialhubuae.com/ar/vendor/v1?aff=ABC",
		);
	});

	it("falls back to the request origin when no host headers are present", async () => {
		vi.mocked(axios.get).mockRejectedValue(new Error("404"));
		const res = await GET(new Request("http://localhost:4000/en/a/nope"), {
			params: Promise.resolve({ locale: "en", slug: "nope" }),
		});
		expect(res.headers.get("location")).toBe("http://localhost:4000/en");
	});
});
