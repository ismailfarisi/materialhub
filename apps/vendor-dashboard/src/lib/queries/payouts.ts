import { useQuery } from "@tanstack/react-query";
import { api } from "../api";

export interface PayoutFilters {
  status?: string;
  page?: number;
  limit?: number;
}

export interface PayoutList {
  items: any[];
  total: number;
}

// GET /vendors/me/payouts spreads the service's `{ data, total }` into the
// response envelope, so the payout array arrives as `body.data` — not
// `body.data.items`, which is what the payouts page reads. Translate here, the
// same way `useVendorReturns` does for the same envelope shape. `items` is
// accepted too so an envelope aligned to /admin/payouts wouldn't break the page.
export function toPayoutList(body: any): PayoutList {
  const items = body?.items ?? body?.data;
  return {
    items: Array.isArray(items) ? items : [],
    total: body?.total ?? 0,
  };
}

export function usePayouts(filters: PayoutFilters = {}) {
  return useQuery({
    queryKey: ["vendor", "payouts", filters],
    queryFn: async () => {
      const { data } = await api.get("/vendors/me/payouts", { params: filters });
      return toPayoutList(data);
    },
  });
}

export function usePayoutEstimate() {
  return useQuery({
    queryKey: ["vendor", "payouts", "estimate"],
    queryFn: async () => {
      const { data } = await api.get("/vendors/me/payouts/estimate");
      return data.data;
    },
  });
}
