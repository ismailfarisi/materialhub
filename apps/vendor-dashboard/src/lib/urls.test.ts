import { describe, expect, test } from "bun:test";
import { API_URL, inboundIntegrationUrl } from "./urls";

describe("inboundIntegrationUrl", () => {
	test("points at the API origin, not the dashboard", () => {
		expect(inboundIntegrationUrl("abc")).toBe(`${API_URL}/integrations/inbound/abc`);
		expect(inboundIntegrationUrl("abc").startsWith("http")).toBe(true);
	});
});
