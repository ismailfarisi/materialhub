import { describe, expect, test } from "bun:test";
import { API_URL, inboundIntegrationUrl } from "./urls";

describe("inboundIntegrationUrl", () => {
	test("points at the API origin, not the dashboard", () => {
		expect(inboundIntegrationUrl("abc")).toBe(`${API_URL}/integrations/inbound/abc/{event_type}`);
		expect(inboundIntegrationUrl("abc").startsWith("http")).toBe(true);
	});

	test("includes the event type segment the API route requires", () => {
		expect(inboundIntegrationUrl("abc", "order.accept")).toBe(
			`${API_URL}/integrations/inbound/abc/order.accept`,
		);
	});
});
