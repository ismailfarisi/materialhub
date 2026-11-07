// default-shipping-account.ts — which carrier account a vendor books with.

/**
 * After a vendor's carrier account verifies, should it become the vendor's
 * default? Yes when the vendor has no default yet, or the default it has is
 * no longer usable (deleted, inactive or unverified). Without this the first
 * verified integration sat unused: auto-booking (resolveShippingAccount)
 * only looks at the vendor's default, then at a platform account, so a
 * vendor with no platform account to fall back on got "no shipping account".
 */
export function shouldBecomeDefaultAccount(
  vendor: { default_shipping_account_id?: string | null } | null | undefined,
  account: { id: string; is_active?: boolean; is_verified?: boolean },
  currentDefault: {
    id: string;
    is_active?: boolean;
    is_verified?: boolean;
    deleted_at?: Date | null;
  } | null,
): boolean {
  if (!vendor || !account.is_active || !account.is_verified) return false;
  if (!vendor.default_shipping_account_id) return true;
  if (vendor.default_shipping_account_id === account.id) return false;
  return (
    !currentDefault ||
    Boolean(currentDefault.deleted_at) ||
    !currentDefault.is_active ||
    !currentDefault.is_verified
  );
}
