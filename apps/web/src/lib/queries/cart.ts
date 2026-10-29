import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ensureGuestSessionToken } from "../api";
import { useCartStore } from "@/stores/cart";

// Checkout totals are derived from the cart server-side: any cart mutation
// must refetch the quote (else stale totals linger until the ~3min quote
// expiry) and the applicable-coupons list.
function invalidateCartDerived(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: ["cart"] });
  queryClient.invalidateQueries({ queryKey: ["checkout", "quote"] });
  queryClient.invalidateQueries({ queryKey: ["checkout", "available-coupons"] });
}

export function useCart() {
  const setItemCount = useCartStore((s) => s.setItemCount);

  return useQuery({
    queryKey: ["cart"],
    queryFn: async () => {
      const { data } = await api.get("/cart");
      const raw = data.data;
      const staleSet = new Set(raw.staleItems || []);

      // Flatten vendor-grouped items and map entity fields to UI fields.
      // unit_price is authoritative — backend re-resolves flash deals and
      // snaps stale prices on every getCart, surfacing genuinely stale rows
      // via raw.staleItems. Don't shadow it with product.price (which would
      // lose the deal price).
      const items = (raw.items || []).flatMap((group: any) =>
        (group.items || []).map((item: any) => {
          const primaryImage = item.product?.images?.find((img: any) => img.is_primary)
            || item.product?.images?.[0];
          return {
            product_id: item.product_id,
            variant_id: item.variant_id || item.product_id,
            vendor_id: item.vendor_id || group.vendor_id,
            product_slug: item.product?.slug || null,
            product_title: item.product?.name || "Unknown product",
            variant_label: item.variant?.name || null,
            image_url: primaryImage?.url || "/placeholder.png",
            added_price: item.unit_price,
            current_price: item.unit_price,
            is_stale: staleSet.has(item.id),
            quantity: item.quantity,
            vendor_name: group.vendor_name || "Other",
          };
        })
      );

      setItemCount(items.length);
      return { cart: raw.cart, items, staleItems: raw.staleItems };
    },
  });
}

export function useAddToCart() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (item: {
      productId: string;
      variantId: string | null;
      quantity: number;
    }) => {
      await ensureGuestSessionToken();
      const { data } = await api.post("/cart/items", item);
      return data.data;
    },
    onSuccess: () => {
      invalidateCartDerived(queryClient);
    },
  });
}

export function useUpdateCartItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      variantId,
      quantity,
    }: {
      variantId: string;
      quantity: number;
    }) => {
      await ensureGuestSessionToken();
      const { data } = await api.patch(`/cart/items/${variantId}`, {
        quantity,
      });
      return data.data;
    },
    onSuccess: () => {
      invalidateCartDerived(queryClient);
    },
  });
}

export function useRemoveCartItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (variantId: string) => {
      // No DELETE /cart/items/:id endpoint — set quantity to 0 to remove
      await ensureGuestSessionToken();
      const { data } = await api.patch(`/cart/items/${variantId}`, { quantity: 0 });
      return data.data;
    },
    onSuccess: () => {
      invalidateCartDerived(queryClient);
    },
  });
}

export function useClearCart() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      await ensureGuestSessionToken();
      await api.delete("/cart");
    },
    onSuccess: () => {
      invalidateCartDerived(queryClient);
    },
  });
}
