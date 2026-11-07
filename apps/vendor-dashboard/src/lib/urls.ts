/** Public API origin (the one Elysia process; dev :3000). */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000").replace(/\/$/, "");

/** Storefront origin (apps/web; dev :4000). */
export const WEB_URL = (process.env.NEXT_PUBLIC_WEB_URL || "http://localhost:4000").replace(/\/$/, "");

/** The URL a vendor's system POSTs inbound events to. Served by the API, not the dashboard. */
export function inboundIntegrationUrl(integrationId: string): string {
	return `${API_URL}/integrations/inbound/${integrationId}`;
}
