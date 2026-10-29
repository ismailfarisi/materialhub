import type { BrowserEvent, ChannelDescriptor, EventPayload } from "./types";

const channels: ChannelDescriptor[] = [];

export function registerChannel(c: ChannelDescriptor): void {
	if (channels.find((existing) => existing.id === c.id)) return;
	channels.push(c);
}

export function getRegisteredChannels(): ChannelDescriptor[] {
	return [...channels];
}

declare global {
	interface Window {
		// biome-ignore lint/suspicious/noExplicitAny: gtag is dynamically typed
		gtag?: (...args: any[]) => void;
		dataLayer?: unknown[];
		// biome-ignore lint/suspicious/noExplicitAny: fbq is dynamically typed
		fbq?: (...args: any[]) => void;
		_fbq?: unknown;
		// biome-ignore lint/suspicious/noExplicitAny: ttq is dynamically typed
		ttq?: any;
	}
}

export interface MetaAdvancedMatching {
	em?: string;
	ph?: string;
	fn?: string;
	ln?: string;
	ct?: string;
	country?: string;
	external_id?: string;
}

/**
 * Field-name shape for TikTok's `ttq.identify()` Advanced Matching call.
 * Distinct from MetaAdvancedMatching: TikTok uses `email` / `phone_number` /
 * `external_id` (not Meta's `em` / `ph` / `external_id`). Values are passed
 * RAW — TikTok Pixel hashes them browser-side per spec.
 */
export interface TiktokAdvancedMatching {
	email?: string;
	phone_number?: string;
	external_id?: string;
}

export function buildGoogleChannel(args: {
	/** e.g. "G-XXXXXXX" or "AW-NNNNNNN" */
	gtagId: string;
	/** e.g. "AW-NNNNNNN/CONV_LABEL" */
	conversionId: string;
}): ChannelDescriptor {
	return {
		id: "google",
		scriptSrc: `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(args.gtagId)}`,
		scriptInit: `
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      window.gtag = gtag;
      gtag('js', new Date());
      gtag('config', '${args.gtagId}', { send_page_view: false });
    `,
		fire: (event: BrowserEvent, payload: EventPayload) => {
			if (typeof window === "undefined" || !window.gtag) return;
			if (event === "AuthModalOpen") {
				window.gtag("event", "auth_modal_open", {
					event_id: payload.event_id,
					mode: payload.mode,
					returnTo: payload.returnTo,
				});
				return;
			}
			if (event === "SendOTP") {
				window.gtag("event", "send_otp", {
					event_id: payload.event_id,
					status: payload.status,
					error: payload.error,
				});
				return;
			}
			if (event === "VerifyOTP") {
				window.gtag("event", "verify_otp", {
					event_id: payload.event_id,
					status: payload.status,
					error: payload.error,
					requires_registration: payload.requires_registration,
				});
				return;
			}
			if (event === "RegisterUser") {
				window.gtag("event", "sign_up", {
					event_id: payload.event_id,
					status: payload.status,
					error: payload.error,
					method: "phone",
				});
				return;
			}
			const value =
				payload.value_fils != null ? payload.value_fils / 100 : undefined;
			const base = {
				event_id: payload.event_id,
				currency: payload.currency,
				value,
				items: payload.product_id
					? [
							{
								item_id: payload.variant_id ?? payload.product_id,
								item_name: payload.product_name,
								item_brand: payload.brand,
								item_category: payload.category_id,
								quantity: payload.quantity ?? 1,
								price: value,
							},
						]
					: undefined,
			};
			const name = (
				{
					PageView: "page_view",
					ViewContent: "view_item",
					AddToCart: "add_to_cart",
					InitiateCheckout: "begin_checkout",
					Purchase: "purchase",
				} as const
			)[event];
			window.gtag("event", name, {
				...base,
				...(event === "Purchase"
					? { transaction_id: payload.transaction_id ?? payload.order_id }
					: {}),
			});
			// Purchase also fires the conversion event for Google Ads attribution.
			if (event === "Purchase") {
				window.gtag("event", "conversion", {
					send_to: args.conversionId,
					transaction_id: payload.transaction_id ?? payload.order_id,
					currency: payload.currency,
					value,
				});
			}
		},
	};
}

export function buildMetaChannel(args: {
	pixelId: string;
	advancedMatching: MetaAdvancedMatching | null;
}): ChannelDescriptor {
	// The base Pixel bootstrap snippet mirrors Meta's published one. We split
	// it into scriptSrc (the actual fbevents.js fetch) and scriptInit (the
	// queue stub + fbq('init', ...)) so next/script can inject them in order.
	// Escape `</` to `<\/` so a malicious AM value (e.g. `fn: "</script>..."`)
	// can't break out of the inline <script> block. Standard JSON-in-HTML
	// defense — Next.js does this for `__NEXT_DATA__`.
	const safeJson = (value: unknown): string =>
		JSON.stringify(value).replace(/<\//g, "<\\/");
	const initCall = args.advancedMatching
		? `fbq('init', '${args.pixelId}', ${safeJson(args.advancedMatching)})`
		: `fbq('init', '${args.pixelId}')`;

	// PageView is NOT auto-fired here. The channel registry's own PageView
	// dispatch (via `useChannelEvents()` + `<PageViewFire>`) fires it with the
	// shared event_id so server-side dedup works consistently.
	return {
		id: "meta",
		scriptSrc: "https://connect.facebook.net/en_US/fbevents.js",
		scriptInit: `
      !function(f,b,e,v,n,t,s){
        if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};
        if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[]
      }(window);
      ${initCall};
    `,
		fire: (event: BrowserEvent, payload: EventPayload) => {
			if (typeof window === "undefined" || !window.fbq) return;
			const value =
				payload.value_fils != null ? payload.value_fils / 100 : undefined;
			const contentId = payload.variant_id ?? payload.product_id;
			const contentIds = contentId ? [contentId] : undefined;
			const quantity = payload.quantity ?? 1;
			const contents = contentId ? [{ id: contentId, quantity }] : undefined;

			let params: Record<string, unknown>;
			switch (event) {
				case "PageView":
				case "AuthModalOpen":
				case "SendOTP":
				case "VerifyOTP":
					params = {};
					break;
				case "RegisterUser":
					params = {};
					if (payload.status === "success") {
						window.fbq("track", "CompleteRegistration", params, {
							eventID: payload.event_id,
						});
						return;
					}
					break;
				case "ViewContent":
				case "AddToCart":
					params = {
						content_ids: contentIds,
						content_type: "product",
						value,
						currency: payload.currency,
						...(event === "AddToCart" ? { contents } : {}),
					};
					break;
				case "InitiateCheckout":
					params = {
						value,
						currency: payload.currency,
						num_items: quantity,
						content_ids: contentIds,
					};
					break;
				case "Purchase":
					params = {
						content_ids: contentIds,
						content_type: "product",
						value,
						currency: payload.currency,
						contents,
					};
					break;
				default: {
					// Exhaustiveness trap: if a new BrowserEvent is added to
					// ../channels/types without a case here, TypeScript fails to compile.
					const _exhaustive: never = event;
					throw new Error(`unhandled_browser_event: ${String(_exhaustive)}`);
				}
			}

			window.fbq("track", event, params, { eventID: payload.event_id });
		},
	};
}

/**
 * The string literal "CompletePayment" is TikTok's name for the Purchase
 * semantic. Mirrored on the server in
 * backend/apps/integration-service/src/domain/channels/adapters/tiktok.adapter.ts
 * (constant TIKTOK_PURCHASE_EVENT). If this string changes here, change it
 * there too — both files' tests pin the literal.
 */
export function buildTikTokChannel(args: {
	pixelCode: string;
	advancedMatching: TiktokAdvancedMatching | null;
}): ChannelDescriptor {
	// Escape `</` to `<\/` so a malicious AM value can't break out of the
	// inline <script>. Standard JSON-in-HTML defense (same shape as Meta).
	const safeJson = (value: unknown): string =>
		JSON.stringify(value).replace(/<\//g, "<\\/");
	const identifyCall = args.advancedMatching
		? `ttq.identify(${safeJson(args.advancedMatching)});`
		: "";

	return {
		id: "tiktok",
		// No scriptSrc: TikTok's canonical bootstrap injects events.js itself
		// via ttq.load() (with the required `sdkid` query param). Setting
		// scriptSrc here too would cause a duplicate events.js load.
		scriptInit: `
      !function (w, d, t) {
        w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"];ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};
      }(window, document, 'ttq');
      ttq.load('${args.pixelCode}');
      ${identifyCall}
      ttq.page();
    `,
		fire: (event: BrowserEvent, payload: EventPayload) => {
			if (typeof window === "undefined" || !window.ttq) return;
			const value =
				payload.value_fils != null ? payload.value_fils / 100 : undefined;
			const contentId = payload.variant_id ?? payload.product_id;
			const contents = contentId
				? [
						{
							content_id: contentId,
							content_type: "product",
							quantity: payload.quantity ?? 1,
							price: value,
						},
					]
				: undefined;

			// TikTok's "CompletePayment" maps to our internal "Purchase".
			// All other events use the TikTok-native name 1:1 with our enum.
			let tiktokName: string;
			let params: Record<string, unknown>;
			switch (event) {
				case "PageView":
					tiktokName = "PageView";
					params = { event_id: payload.event_id };
					break;
				case "AuthModalOpen":
				case "SendOTP":
				case "VerifyOTP":
					tiktokName = event;
					params = { event_id: payload.event_id };
					break;
				case "RegisterUser":
					tiktokName = "CompleteRegistration";
					params = { event_id: payload.event_id, status: payload.status };
					break;
				case "ViewContent":
					tiktokName = "ViewContent";
					params = {
						event_id: payload.event_id,
						contents,
						content_type: "product",
						value,
						currency: payload.currency,
					};
					break;
				case "AddToCart":
					tiktokName = "AddToCart";
					params = {
						event_id: payload.event_id,
						contents,
						content_type: "product",
						value,
						currency: payload.currency,
					};
					break;
				case "InitiateCheckout":
					tiktokName = "InitiateCheckout";
					params = {
						event_id: payload.event_id,
						contents,
						content_type: "product",
						value,
						currency: payload.currency,
					};
					break;
				case "Purchase":
					// CompletePayment is TikTok's name for the Purchase semantic.
					// Cross-referenced in tiktok.adapter.ts (TIKTOK_PURCHASE_EVENT).
					tiktokName = "CompletePayment";
					params = {
						event_id: payload.event_id,
						contents,
						content_type: "product",
						value,
						currency: payload.currency,
						order_id: payload.order_id,
					};
					break;
				default: {
					// Exhaustiveness trap: if a new BrowserEvent is added to
					// ./types without a case here, TypeScript fails to compile.
					const _exhaustive: never = event;
					throw new Error(`unhandled_browser_event: ${String(_exhaustive)}`);
				}
			}

			// TikTok's `ttq` is an object with method properties — call
			// `.track()` directly. (`ttq` is never callable: after the IIFE
			// it is an Array with setAndDefer'd method properties; after
			// events.js loads, those methods are replaced with real ones.)
			window.ttq.track(tiktokName, params);
		},
	};
}
