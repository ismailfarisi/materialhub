import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	buildGoogleChannel,
	buildMetaChannel,
	buildTikTokChannel,
} from "./registry";
import type { EventPayload } from "./types";

if (typeof window === "undefined") {
	// biome-ignore lint/suspicious/noExplicitAny: polyfill for bun test env
	(globalThis as any).window = globalThis;
}

declare global {
	interface Window {
		// biome-ignore lint/suspicious/noExplicitAny: gtag is dynamically typed
		gtag?: (...args: any[]) => void;
		// biome-ignore lint/suspicious/noExplicitAny: fbq is dynamically typed
		fbq?: (...args: any[]) => void;
		// biome-ignore lint/suspicious/noExplicitAny: ttq is dynamically typed
		ttq?: any;
	}
}

const GTAG_ARGS: unknown[][] = [];
const FBQ_ARGS: unknown[][] = [];
const TTQ_ARGS: unknown[][] = [];

beforeEach(() => {
	GTAG_ARGS.length = 0;
	FBQ_ARGS.length = 0;
	TTQ_ARGS.length = 0;

	window.gtag = ((...args: unknown[]) => {
		GTAG_ARGS.push(args);
	}) as unknown as Window["gtag"];

	window.fbq = ((...args: unknown[]) => {
		FBQ_ARGS.push(args);
	}) as unknown as Window["fbq"];
});

afterEach(() => {
	delete window.gtag;
	delete window.fbq;
	delete window.ttq;
});

function basePayload(overrides: Partial<EventPayload> = {}): EventPayload {
	return {
		event_id: "evt-1",
		currency: "AED",
		value_fils: 12500,
		product_id: "prod-1",
		product_name: "Saffron Oud",
		quantity: 1,
		gclid: null,
		...overrides,
	};
}

describe("buildGoogleChannel", () => {
	it("returns a descriptor with id='google'", () => {
		const ch = buildGoogleChannel({
			gtagId: "G-123",
			conversionId: "AW-456/label",
		});
		expect(ch.id).toBe("google");
		expect(ch.scriptSrc).toContain("G-123");
	});

	it("fires AuthModalOpen with mode and returnTo", () => {
		const ch = buildGoogleChannel({
			gtagId: "G-123",
			conversionId: "AW-456/label",
		});
		ch.fire("AuthModalOpen", {
			event_id: "evt-1",
			mode: "login",
			returnTo: "/checkout",
		});
		expect(GTAG_ARGS).toEqual([
			[
				"event",
				"auth_modal_open",
				{ event_id: "evt-1", mode: "login", returnTo: "/checkout" },
			],
		]);
	});

	it("fires SendOTP with status and error", () => {
		const ch = buildGoogleChannel({
			gtagId: "G-123",
			conversionId: "AW-456/label",
		});
		ch.fire("SendOTP", {
			event_id: "evt-1",
			status: "success",
			error: undefined,
		});
		expect(GTAG_ARGS).toEqual([
			[
				"event",
				"send_otp",
				{ event_id: "evt-1", status: "success", error: undefined },
			],
		]);
	});

	it("fires VerifyOTP with status, error, and requires_registration", () => {
		const ch = buildGoogleChannel({
			gtagId: "G-123",
			conversionId: "AW-456/label",
		});
		ch.fire("VerifyOTP", {
			event_id: "evt-1",
			status: "success",
			error: undefined,
			requires_registration: true,
		});
		expect(GTAG_ARGS).toEqual([
			[
				"event",
				"verify_otp",
				{
					event_id: "evt-1",
					status: "success",
					error: undefined,
					requires_registration: true,
				},
			],
		]);
	});

	it("fires RegisterUser as sign_up with method='phone'", () => {
		const ch = buildGoogleChannel({
			gtagId: "G-123",
			conversionId: "AW-456/label",
		});
		ch.fire("RegisterUser", {
			event_id: "evt-1",
			status: "success",
			error: undefined,
		});
		expect(GTAG_ARGS).toEqual([
			[
				"event",
				"sign_up",
				{
					event_id: "evt-1",
					status: "success",
					error: undefined,
					method: "phone",
				},
			],
		]);
	});
});

describe("buildMetaChannel", () => {
	it("returns a descriptor with id='meta' and the Pixel script src", () => {
		const ch = buildMetaChannel({ pixelId: "111", advancedMatching: null });
		expect(ch.id).toBe("meta");
		expect(ch.scriptSrc).toBe("https://connect.facebook.net/en_US/fbevents.js");
		expect(ch.scriptInit).toContain("fbq('init', '111'");
	});

	it("emits anonymous fbq('init', pixelId) when advancedMatching is null", () => {
		const ch = buildMetaChannel({ pixelId: "111", advancedMatching: null });
		expect(ch.scriptInit).toContain("fbq('init', '111')");
		// Does NOT contain a serialized advanced-matching object.
		expect(ch.scriptInit).not.toMatch(/fbq\('init', '111', \{/);
	});

	it("emits fbq('init', pixelId, AM) when advancedMatching is provided", () => {
		const ch = buildMetaChannel({
			pixelId: "111",
			advancedMatching: {
				em: "test@example.com",
				ph: "+971501234567",
				fn: "aisha",
				ln: "khan",
				ct: "dubai",
				country: "ae",
				external_id: "user-7",
			},
		});
		expect(ch.scriptInit).toContain(`fbq('init', '111', `);
		expect(ch.scriptInit).toContain('"em":"test@example.com"');
		expect(ch.scriptInit).toContain('"ph":"+971501234567"');
		expect(ch.scriptInit).toContain('"external_id":"user-7"');
	});

	it("escapes </script> inside advancedMatching JSON to prevent inline-script break-out", () => {
		const ch = buildMetaChannel({
			pixelId: "111",
			advancedMatching: {
				em: "user@example.com",
				fn: "</script><script>alert(1)</script>",
				external_id: "user-x",
			},
		});
		// The literal "</script>" must NOT appear inside scriptInit — it would
		// close the inline <script> wrapper when injected via dangerouslySetInnerHTML.
		expect(ch.scriptInit).not.toContain("</script>");
		// The escaped form should be present.
		expect(ch.scriptInit).toContain("<\\/script>");
	});

	it("fire('PageView') calls fbq('track', 'PageView') with the event_id as eventID", () => {
		const ch = buildMetaChannel({ pixelId: "111", advancedMatching: null });
		ch.fire("PageView", basePayload());
		expect(FBQ_ARGS).toEqual([["track", "PageView", {}, { eventID: "evt-1" }]]);
	});

	it("fire('ViewContent') maps content_ids + value + currency", () => {
		const ch = buildMetaChannel({ pixelId: "111", advancedMatching: null });
		ch.fire("ViewContent", basePayload());
		expect(FBQ_ARGS).toHaveLength(1);
		const [, name, params, options] = FBQ_ARGS[0]!;
		expect(name).toBe("ViewContent");
		expect(params).toEqual({
			content_ids: ["prod-1"],
			content_type: "product",
			value: 125,
			currency: "AED",
		});
		expect(options).toEqual({ eventID: "evt-1" });
	});

	it("fire('AddToCart') includes contents array with quantity", () => {
		const ch = buildMetaChannel({ pixelId: "111", advancedMatching: null });
		ch.fire("AddToCart", basePayload({ quantity: 3 }));
		const [, name, params] = FBQ_ARGS[0]!;
		expect(name).toBe("AddToCart");
		expect(params).toMatchObject({
			content_ids: ["prod-1"],
			content_type: "product",
			value: 125,
			currency: "AED",
			contents: [{ id: "prod-1", quantity: 3 }],
		});
	});

	it("fire('InitiateCheckout') maps value + currency + num_items", () => {
		const ch = buildMetaChannel({ pixelId: "111", advancedMatching: null });
		ch.fire("InitiateCheckout", basePayload({ quantity: 2 }));
		const [, name, params] = FBQ_ARGS[0]!;
		expect(name).toBe("InitiateCheckout");
		expect(params).toMatchObject({
			value: 125,
			currency: "AED",
			num_items: 2,
		});
	});

	it("fire('Purchase') passes event_id as Meta's eventID for CAPI dedup", () => {
		const ch = buildMetaChannel({ pixelId: "111", advancedMatching: null });
		ch.fire("Purchase", basePayload({ order_id: "ord-9", quantity: 4 }));
		const [, name, params, options] = FBQ_ARGS[0]!;
		expect(name).toBe("Purchase");
		expect(params).toMatchObject({
			content_ids: ["prod-1"],
			content_type: "product",
			value: 125,
			currency: "AED",
			contents: [{ id: "prod-1", quantity: 4 }],
		});
		expect(options).toEqual({ eventID: "evt-1" });
	});

	it("fires AuthModalOpen, SendOTP, VerifyOTP with empty params", () => {
		const ch = buildMetaChannel({ pixelId: "111", advancedMatching: null });
		ch.fire("AuthModalOpen", { event_id: "evt-1" });
		ch.fire("SendOTP", { event_id: "evt-2" });
		ch.fire("VerifyOTP", { event_id: "evt-3" });
		expect(FBQ_ARGS).toEqual([
			["track", "AuthModalOpen", {}, { eventID: "evt-1" }],
			["track", "SendOTP", {}, { eventID: "evt-2" }],
			["track", "VerifyOTP", {}, { eventID: "evt-3" }],
		]);
	});

	it("fires RegisterUser as CompleteRegistration when status is success", () => {
		const ch = buildMetaChannel({ pixelId: "111", advancedMatching: null });
		ch.fire("RegisterUser", { event_id: "evt-1", status: "success" });
		expect(FBQ_ARGS).toEqual([
			["track", "CompleteRegistration", {}, { eventID: "evt-1" }],
		]);
	});

	it("fires RegisterUser as RegisterUser when status is failure or omitted", () => {
		const ch = buildMetaChannel({ pixelId: "111", advancedMatching: null });
		ch.fire("RegisterUser", { event_id: "evt-1", status: "failure" });
		expect(FBQ_ARGS).toEqual([
			["track", "RegisterUser", {}, { eventID: "evt-1" }],
		]);
	});

	it("fire() is a no-op when window.fbq is not loaded yet", () => {
		delete window.fbq;
		const ch = buildMetaChannel({ pixelId: "111", advancedMatching: null });
		expect(() => ch.fire("PageView", basePayload())).not.toThrow();
	});
});

describe("buildTikTokChannel", () => {
	const PIXEL = "CK2XXXXXXXXXXXXXXXXXXXXX";

	beforeEach(() => {
		// Match the real TikTok runtime: `ttq` is an object with method
		// properties (ttq.track, ttq.page, ttq.identify, ...), NEVER a
		// callable function.
		window.ttq = {
			track: (...args: unknown[]) => {
				TTQ_ARGS.push(args);
			},
		} as unknown as Window["ttq"];
	});

	it("returns a descriptor with id 'tiktok' and NO scriptSrc (ttq.load injects events.js)", () => {
		const ch = buildTikTokChannel({ pixelCode: PIXEL, advancedMatching: null });
		expect(ch.id).toBe("tiktok");
		expect(ch.scriptSrc).toBeUndefined();
	});

	it("scriptInit calls ttq.load + ttq.page when no Advanced Matching", () => {
		const ch = buildTikTokChannel({ pixelCode: PIXEL, advancedMatching: null });
		expect(ch.scriptInit).toContain(`ttq.load('${PIXEL}')`);
		expect(ch.scriptInit).toContain("ttq.page()");
		expect(ch.scriptInit).not.toContain("ttq.identify");
	});

	it("scriptInit calls ttq.identify with AM payload when present", () => {
		const ch = buildTikTokChannel({
			pixelCode: PIXEL,
			advancedMatching: {
				email: "buyer@example.com",
				phone_number: "+971501234567",
				external_id: "usr-1",
			},
		});
		expect(ch.scriptInit).toContain("ttq.identify(");
		expect(ch.scriptInit).toContain('"email":"buyer@example.com"');
		expect(ch.scriptInit).toContain('"phone_number":"+971501234567"');
		expect(ch.scriptInit).toContain('"external_id":"usr-1"');
	});

	it("escapes </script> in AM JSON (XSS defense)", () => {
		const ch = buildTikTokChannel({
			pixelCode: PIXEL,
			advancedMatching: {
				external_id: "</script><script>alert(1)</script>",
			},
		});
		expect(ch.scriptInit).not.toContain("</script>");
		expect(ch.scriptInit).toContain("<\\/script>");
		expect(ch.scriptInit?.match(/<\\\/script>/g) ?? []).toHaveLength(2);
	});

	it("fires Purchase as CompletePayment (TikTok's event name)", () => {
		const ch = buildTikTokChannel({ pixelCode: PIXEL, advancedMatching: null });
		ch.fire("Purchase", {
			event_id: "ord-abc",
			currency: "AED",
			value_fils: 12950,
			order_id: "ord-abc",
			product_id: "SKU-1",
			quantity: 2,
		});
		expect(TTQ_ARGS).toHaveLength(1);
		const [name, params] = TTQ_ARGS[0]!;
		expect(name).toBe("CompletePayment");
		expect(params).toMatchObject({
			event_id: "ord-abc",
			currency: "AED",
			value: 129.5,
			order_id: "ord-abc",
		});
	});

	it("fires ViewContent / AddToCart / InitiateCheckout / PageView with TikTok-native names", () => {
		const ch = buildTikTokChannel({ pixelCode: PIXEL, advancedMatching: null });
		const payload: EventPayload = { event_id: "evt-1" };
		ch.fire("PageView", payload);
		ch.fire("ViewContent", payload);
		ch.fire("AddToCart", payload);
		ch.fire("InitiateCheckout", payload);
		expect(TTQ_ARGS.map((c) => c[0])).toEqual([
			"PageView",
			"ViewContent",
			"AddToCart",
			"InitiateCheckout",
		]);
	});

	it("fires AuthModalOpen, SendOTP, VerifyOTP with event_id", () => {
		const ch = buildTikTokChannel({ pixelCode: PIXEL, advancedMatching: null });
		ch.fire("AuthModalOpen", { event_id: "evt-1" });
		ch.fire("SendOTP", { event_id: "evt-2" });
		ch.fire("VerifyOTP", { event_id: "evt-3" });
		expect(TTQ_ARGS).toEqual([
			["AuthModalOpen", { event_id: "evt-1" }],
			["SendOTP", { event_id: "evt-2" }],
			["VerifyOTP", { event_id: "evt-3" }],
		]);
	});

	it("fires RegisterUser as CompleteRegistration with status", () => {
		const ch = buildTikTokChannel({ pixelCode: PIXEL, advancedMatching: null });
		ch.fire("RegisterUser", { event_id: "evt-1", status: "success" });
		expect(TTQ_ARGS).toEqual([
			["CompleteRegistration", { event_id: "evt-1", status: "success" }],
		]);
	});

	it("is a no-op when window.ttq is not loaded", () => {
		delete window.ttq;
		const ch = buildTikTokChannel({ pixelCode: PIXEL, advancedMatching: null });
		expect(() => ch.fire("PageView", { event_id: "x" })).not.toThrow();
	});
});
