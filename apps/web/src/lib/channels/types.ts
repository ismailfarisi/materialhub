export type BrowserEvent =
	| "PageView"
	| "ViewContent"
	| "AddToCart"
	| "InitiateCheckout"
	| "Purchase"
	| "AuthModalOpen"
	| "SendOTP"
	| "VerifyOTP"
	| "RegisterUser";

export interface EventPayload {
	event_id: string;
	product_id?: string;
	variant_id?: string;
	product_name?: string;
	category_id?: string;
	brand?: string;
	currency?: string;
	/** Unit: fils. The channel-specific fire converts to its native unit (decimal for Google, etc.). */
	value_fils?: number;
	quantity?: number;
	// Purchase only:
	order_id?: string;
	/** Same as order_id; named for Google's API. */
	transaction_id?: string;
	gclid?: string | null;
	customer_email?: string;
	customer_phone?: string;
	// Auth events:
	mode?: "login" | "register";
	status?: "success" | "failure";
	error?: string;
	requires_registration?: boolean;
	returnTo?: string;
}

export interface ChannelDescriptor {
	/** "google" | "meta" | "tiktok" */
	id: string;
	/** for next/script src */
	scriptSrc?: string;
	/** inline script for initial config */
	scriptInit?: string;
	fire: (event: BrowserEvent, payload: EventPayload) => void;
}
