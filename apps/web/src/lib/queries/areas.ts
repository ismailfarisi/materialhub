import { useQuery } from "@tanstack/react-query";
import { api } from "../api";

/**
 * A platform delivery zone ("area") — the same area list `user_addresses
 * .area_id` FKs to (db-design/09-logistics-delivery.md) and that the
 * booking backend's `area` query param on
 * `GET /services/:slug/availability` expects an id from (checked against
 * the vendor's `service_areas`). No dedicated "areas" endpoint/component
 * existed anywhere in apps/web (the checkout address form uses a free-text
 * `area` string, not an area_id picker) — this is the first typed
 * consumer, reusing the existing public order-service endpoint.
 */
export interface DeliveryZone {
  id: string;
  name: string;
  slug: string;
  city: string;
  emirate: string;
  country_code: string;
  is_active: boolean;
  sort_order: number;
}

/** GET /shipping/delivery-zones — public (order-service), active zones only, sorted. */
export function useAreas(enabled = true) {
  return useQuery({
    queryKey: ["shipping", "delivery-zones"],
    queryFn: async () => {
      const { data } = await api.get("/shipping/delivery-zones");
      return (data.data ?? []) as DeliveryZone[];
    },
    enabled,
    staleTime: 10 * 60 * 1000,
  });
}
