/** Public API origin (the one Elysia process; dev :3000). */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000").replace(/\/$/, "");

/** Storefront origin (apps/web; dev :4000). */
export const WEB_URL = (process.env.NEXT_PUBLIC_WEB_URL || "http://localhost:4000").replace(/\/$/, "");

/**
 * The URL a vendor's system POSTs inbound events to, served by the API (not
 * the dashboard). The route is /integrations/inbound/:id/:event_type, so the
 * event goes in the last segment, e.g. .../order.accept.
 */
export function inboundIntegrationUrl(integrationId: string, eventType = "{event_type}"): string {
	return `${API_URL}/integrations/inbound/${integrationId}/${eventType}`;
}
