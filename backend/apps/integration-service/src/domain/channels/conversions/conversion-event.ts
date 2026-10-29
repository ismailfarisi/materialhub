/**
 * Channel-agnostic shape passed from the conversion worker to each
 * channel-specific conversion adapter (Google Ads, future Meta CAPI, future
 * TikTok Events API). The worker hydrates this from the order + user + items
 * once per job and fans the same payload out across enabled channels.
 *
 * Monetary fields are in fils (Phase 1b — AED only). Adapters convert to
 * their native unit (Google Ads expects decimal currency).
 */
export interface ConversionEventPayload {
  order_id: string;
  currency: string;
  value_fils: number;
  customer: {
    email: string | null;
    phone: string | null;
    first_name: string | null;
    last_name: string | null;
    /** Internal user id, hashed by TikTok adapter for `external_id`. */
    user_id: string | null;
  };
  items: Array<{ offer_id: string; quantity: number; price_fils: number }>;
  /**
   * Browser-captured Google click identifier. Phase 1b ships `null` from the
   * worker (transport from browser sessionStorage → server is deferred); a
   * follow-up plumbs this through the checkout flow into an order column.
   */
  gclid: string | null;
  occurred_at: Date;
  /**
   * Customer-facing URL where the conversion occurred. Used by Meta CAPI
   * (`event_source_url`) and TikTok Events API (`page.url`) for match-quality
   * scoring. Same default for both — the order-detail page on the prod domain.
   */
  event_source_url: string;
}
